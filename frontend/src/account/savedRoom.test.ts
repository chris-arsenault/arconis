import { afterEach, expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { PictureStore, type StoredPicture } from "../collaboration/pictureStore";
import { RoomLock, type LockedStorage } from "../collaboration/roomLock";
import { LockedTransport } from "../collaboration/lockedTransport";
import type { FrameChannel } from "../collaboration/channel";
import { openEnvelope, WrongPassword, type Envelope } from "../collaboration/roomKey";
import { SavedRoom } from "./savedRoom";
import { decodeContents } from "./workspaceFile";

const BYTES = new Uint8Array([1, 2, 3]);
const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function workspace(passwordRequired = false) {
  const document = new CanvasDocument();
  const updates: Uint8Array[] = [];
  let envelope: Envelope | undefined;
  const storage: LockedStorage = {
    envelope: () => Promise.resolve(envelope),
    saveEnvelope: async (value) => {
      envelope = value;
    },
    updates: () => Promise.resolve(updates),
    addUpdate: async (value) => {
      updates.push(value);
    },
    replaceUpdates: async (value) => {
      updates.splice(0, updates.length, value);
    },
    close: () => {},
  };
  const channel: FrameChannel = {
    onMessage: () => {},
    onReady: () => {},
    onStatus: () => {},
    connect: () => {},
    send: () => {},
    close: () => {},
  };
  const locked = new LockedTransport(channel, "test");
  const key = new RoomLock(
    storage,
    locked,
    document.doc,
    () => {},
    false,
    passwordRequired ? null : "room"
  );
  await key.whenSynced;
  const shelf = new Map<string, StoredPicture>();
  const pictures = new PictureStore({
    shelf: {
      get: (hash) => Promise.resolve(shelf.get(hash)),
      put: async (hash, picture) => {
        shelf.set(hash, picture);
      },
    },
    codec: key.codec,
    download: null,
    createUrl: () => "blob:test",
    revokeUrl: () => {},
  });
  const lifetime = new AbortController();
  const persistence = key;
  const room = new SavedRoom("room", document, pictures, key, lifetime.signal, () => {});
  cleanups.push(async () => {
    lifetime.abort();
    pictures.close();
    await key?.destroy();
    locked.close();
    document.destroy();
  });
  return { document, pictures, key, room, lifetime, persistence };
}

it("merges saved state without losing local edits or treating restore/persistence as new edits", async () => {
  const first = await workspace();
  first.document.create("note", 0, 0, { id: "from_first", name: "First" });
  const copy = await first.room.contents();
  const second = await workspace();
  const changed = vi.fn();
  const stop = second.room.onChange(changed);
  second.document.create("note", 100, 0, { id: "from_second", name: "Second" });
  expect(changed).toHaveBeenCalledOnce();
  await second.room.apply(copy);
  expect(
    second.document
      .list()
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(["First", "Second"]);
  expect(changed).toHaveBeenCalledOnce();
  second.document.doc.transact(() => second.document.meta.set("stored", "yes"), second.persistence);
  expect(changed).toHaveBeenCalledOnce();
  second.document.rename("Changed here");
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  second.document.rename("After unsubscribe");
  expect(changed).toHaveBeenCalledTimes(2);
});

it("carries unshared picture bytes and excludes pictures already in shared storage", async () => {
  const first = await workspace();
  const hash = await first.pictures.add(BYTES, "image/png");
  first.document.create("picture", 0, 0, { picture: { hash, format: "image/png", stored: false } });
  first.document.create("picture", 200, 0, {
    picture: { hash: "a".repeat(64), format: "image/png", stored: true },
  });
  const copy = await first.room.contents();
  expect(decodeContents(await first.key.codec.open(copy.sealed)).pictures).toHaveLength(1);
  const target = await workspace();
  await target.room.apply(copy);
  expect(await target.pictures.readOpen(hash)).toEqual({ bytes: BYTES, type: "image/png" });
});

it("reads the current envelope, hides the title and adopts saved keys before waiting for unlock", async () => {
  const first = await workspace(true);
  await first.key!.choose("initial password");
  first.document.rename("Secret project title");
  first.document.create("note", 0, 0, { name: "Secret text" });
  const hash = await first.pictures.add(BYTES, "image/png");
  first.document.create("picture", 0, 0, { picture: { hash, format: "image/png", stored: false } });
  await first.key!.changePassword("new password");
  const copy = await first.room.contents();
  expect(first.room.title()).toBe("Password room");
  expect(copy.envelope.revision).toBe(2);
  expect(new TextDecoder().decode(copy.sealed)).not.toContain("Secret");
  const target = await workspace(true);
  const applying = target.room.apply(copy);
  expect(target.key!.state).toBe("enter");
  expect(target.document.list()).toEqual([]);
  await target.key!.enter("new password");
  await applying;
  expect(target.document.title()).toBe("Secret project title");
  expect(target.document.list().find((item) => item.type === "note")?.name).toBe("Secret text");
  expect(await target.pictures.readOpen(hash)).toEqual({ bytes: BYTES, type: "image/png" });
  const departed = await workspace(true);
  const waiting = departed.room.apply(copy);
  expect(departed.key!.state).toBe("enter");
  departed.lifetime.abort();
  await waiting;
  expect(departed.document.list()).toEqual([]);
});

it("does not apply a saved copy after the room departs", async () => {
  const first = await workspace();
  first.document.create("note", 0, 0, { name: "Elsewhere" });
  const target = await workspace();
  target.lifetime.abort();
  await target.room.apply(await first.room.contents());
  expect(target.document.list()).toEqual([]);
  await expect(target.room.contents()).rejects.toMatchObject({ name: "AbortError" });
});

it("updates account saving when only the room password changes", async () => {
  const first = await workspace(true);
  await first.key.choose("initial password");
  first.document.create("note", 0, 0, { name: "Saved before rewrap" });
  let latest = await first.room.contents();
  const previous = await workspace(true);
  const applyingPrevious = previous.room.apply(latest);
  await previous.key.enter("initial password");
  await applyingPrevious;
  let saving = Promise.resolve();
  const changed = vi.fn(() => {
    saving = first.room.contents().then((copy) => {
      latest = copy;
    });
  });
  const stop = first.room.onChange(changed);
  await first.key.changePassword("replacement password");
  expect(changed).toHaveBeenCalledOnce();
  await saving;
  await expect(openEnvelope("initial password", latest.envelope)).rejects.toBeInstanceOf(
    WrongPassword
  );
  const restored = await workspace(true);
  const applying = restored.room.apply(latest);
  await restored.key.enter("replacement password");
  await applying;
  expect(restored.document.list()[0]?.name).toBe("Saved before rewrap");
  const received = vi.fn();
  const stopReceived = previous.room.onChange(received);
  await previous.room.apply(latest);
  expect(received).not.toHaveBeenCalled();
  stopReceived();
  stop();
});

it("refuses a plain saved copy while a password room is waiting for its envelope", async () => {
  const target = await workspace(true);
  target.document.rename("Private pending room");
  target.document.create("note", 0, 0, { name: "Never publish this unsealed" });
  expect(target.key!.state).toBe("waiting");
  await expect(target.room.contents()).rejects.toThrow("Open this password room before saving.");
});
