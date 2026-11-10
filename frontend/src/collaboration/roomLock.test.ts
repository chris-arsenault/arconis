import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { LockedTransport } from "./lockedTransport";
import { CollaborationProvider } from "./provider";
import { RoomLock, type LockedStorage } from "./roomLock";
import {
  WrongPassword,
  DEFAULT_PASSWORD,
  createEnvelope,
  envelopeMatches,
  generateRoomKey,
  openEnvelope,
  parseEnvelope,
  seal,
  unseal,
  type Envelope,
} from "./roomKey";
import type { ConnectionState, FrameChannel } from "./channel";

const SECRET = "Quarterly secret plan";

/** Carries messages between peers and records everything a relay would see. */
class Wire implements FrameChannel {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState) => void = () => {};
  connected = false;
  constructor(
    private peers: Wire[],
    private seen: string[]
  ) {
    peers.push(this);
  }
  connect() {
    this.connected = true;
    this.onStatus("online");
    this.onReady();
  }
  send(message: string) {
    this.seen.push(message);
    const { target } = JSON.parse(message) as { target: string };
    this.peers
      .filter((peer) => peer !== this && peer.connected)
      .forEach((peer) => {
        if (!target || peer.owner === target) peer.onMessage(message);
      });
  }
  owner = "";
  close() {
    this.connected = false;
  }
}

function memoryStorage(): LockedStorage & { saved: Uint8Array[]; stored: () => unknown } {
  const saved: Uint8Array[] = [];
  let envelope: unknown;
  return {
    saved,
    stored: () => envelope,
    envelope: () => Promise.resolve(envelope),
    saveEnvelope: (value) => {
      envelope = value;
      return Promise.resolve();
    },
    updates: () => Promise.resolve([...saved]),
    addUpdate: (sealed) => {
      saved.push(sealed);
      return Promise.resolve();
    },
    replaceUpdates: (sealed) => {
      saved.splice(0, saved.length, sealed);
      return Promise.resolve();
    },
    close: () => {},
  };
}

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function person(
  wire: { peers: Wire[]; seen: string[] },
  created = false,
  storage = memoryStorage(),
  defaultRoom: string | null = null
) {
  const raw = new Wire(wire.peers, wire.seen);
  const id = crypto.randomUUID();
  raw.owner = id;
  const transport = new LockedTransport(raw, id);
  const document = new CanvasDocument();
  const changed = vi.fn();
  const lock = new RoomLock(storage, transport, document.doc, changed, created, defaultRoom);
  const provider = new CollaborationProvider(
    document.doc,
    transport,
    () => {},
    id,
    document.actions
  );
  provider.connect();
  cleanups.push(() => {
    provider.destroy();
    document.destroy();
  });
  return { document, lock, storage, provider };
}

const network = () => ({ peers: [] as Wire[], seen: [] as string[] });

describe("the key", () => {
  it("round trips through a password, and refuses a wrong one", async () => {
    const key = await generateRoomKey();
    const envelope = await createEnvelope("right", key, 1);
    const opened = await openEnvelope("right", envelope);
    const sealed = await seal(key, new Uint8Array([1, 2, 3]));
    expect([...(await unseal(opened, sealed))]).toEqual([1, 2, 3]);
    await expect(openEnvelope("wrong", envelope)).rejects.toBeInstanceOf(WrongPassword);
  });

  it("detects altered ciphertext and another room's key", async () => {
    const [key, other] = [await generateRoomKey(), await generateRoomKey()];
    const sealed = await seal(key, new Uint8Array([1, 2, 3]));
    await expect(unseal(other, sealed)).rejects.toThrow();
    const altered = new Uint8Array(sealed);
    altered[altered.length - 1] ^= 1;
    await expect(unseal(key, altered)).rejects.toThrow();
  });

  it("uses a fresh nonce every time", async () => {
    const key = await generateRoomKey();
    const bytes = new Uint8Array(32);
    expect(await seal(key, bytes)).not.toEqual(await seal(key, bytes));
  });

  it("tells a real envelope from one planted by someone without the key", async () => {
    const [key, other] = [await generateRoomKey(), await generateRoomKey()];
    expect(await envelopeMatches(key, await createEnvelope("p", key, 2))).toBe(true);
    expect(await envelopeMatches(key, await createEnvelope("p", other, 2))).toBe(false);
  });

  it("refuses an envelope demanding excessive or trivial work", async () => {
    const envelope = await createEnvelope("p", await generateRoomKey(), 1);
    expect(parseEnvelope(envelope)).not.toBeNull();
    expect(parseEnvelope({ ...envelope, iterations: 1 })).toBeNull();
    expect(parseEnvelope({ ...envelope, iterations: 1e12 })).toBeNull();
    expect(parseEnvelope("not json")).toBeNull();
  });
});

describe("automatic room encryption", () => {
  it("auto-unlocks nopass peers through the same sealed transport and storage, including simultaneous fresh joins", async () => {
    const wire = network();
    const a = person(wire, false, memoryStorage(), "same-room");
    const b = person(wire, false, memoryStorage(), "same-room");
    await Promise.all([a.lock.whenSynced, b.lock.whenSynced]);
    expect(a.lock.requiresPassword).toBe(false);
    expect(a.lock.state).toBe("unlocked");
    const id = a.document.create("note", 0, 0, { name: SECRET });
    await vi.waitFor(() => expect(b.document.get(id)?.name).toBe(SECRET));
    expect(wire.seen.join("")).not.toContain(SECRET);
    await vi.waitFor(() => expect(a.storage.saved.length).toBeGreaterThan(0));
    expect(await openEnvelope(DEFAULT_PASSWORD, a.lock.currentEnvelope!)).toBeDefined();
    expect(new TextDecoder().decode(a.storage.saved[0])).not.toContain(SECRET);
  });
});

describe("a password room", () => {
  it("keeps an edit local and sealed until completion, including for a new participant", async () => {
    const wire = network();
    const a = person(wire, true);
    await a.lock.whenSynced;
    await a.lock.choose("right");
    const id = a.document.create("node", 0, 0, { name: SECRET });
    const b = person(wire);
    await vi.waitFor(() => expect(b.lock.state).toBe("enter"));
    await b.lock.enter("right");
    await vi.waitFor(() => expect(b.document.get(id)?.name).toBe(SECRET));
    const saved = a.storage.saved.length;
    const finish = a.document.actions.begin();
    a.document.editText(id, `${SECRET} finished`);
    await vi.waitFor(() => expect(a.storage.saved.length).toBeGreaterThan(saved));
    expect(b.document.get(id)?.name).toBe(SECRET);
    const c = person(wire);
    await vi.waitFor(() => expect(c.lock.state).toBe("enter"));
    await c.lock.enter("right");
    await vi.waitFor(() => expect(c.document.get(id)?.name).toBe(SECRET));
    finish();
    await vi.waitFor(() => expect(c.document.get(id)?.name).toBe(`${SECRET} finished`));
    expect(b.document.list()).toEqual(a.document.list());
    expect(wire.seen.join("")).not.toContain(SECRET);
  });
  it("syncs between people with the password, with no plaintext on the wire or on disk", async () => {
    const wire = network();
    const a = person(wire, true);
    await a.lock.whenSynced;
    expect(a.lock.state).toBe("choose");
    await a.lock.choose("hunter2 is fine");
    const id = a.document.create("node", 0, 0, { name: SECRET });

    const b = person(wire);
    await vi.waitFor(() => expect(b.lock.state).toBe("enter"));
    await b.lock.enter("hunter2 is fine");
    await vi.waitFor(() => expect(b.document.get(id)?.name).toBe(SECRET));
    a.document.patch(id, { name: `${SECRET} two` });
    await vi.waitFor(() => expect(b.document.get(id)?.name).toBe(`${SECRET} two`));

    expect(wire.seen.length).toBeGreaterThan(0);
    const secretBytes = (bytes: string) => bytes.includes("Quarterly") || bytes.includes("secret");
    for (const frame of wire.seen) {
      expect(secretBytes(frame)).toBe(false);
      const { data } = JSON.parse(frame) as { data: string };
      if (data && !data.startsWith("{")) expect(secretBytes(atob(data))).toBe(false);
    }
    await vi.waitFor(() => expect(a.storage.saved.length).toBeGreaterThan(0));
    for (const sealed of a.storage.saved)
      expect(secretBytes(new TextDecoder("latin1").decode(sealed))).toBe(false);
  });

  it("keeps out a wrong password, with a clear message and nothing received", async () => {
    const wire = network();
    const a = person(wire, true);
    await a.lock.whenSynced;
    await a.lock.choose("right");
    a.document.create("node", 0, 0, { name: SECRET });
    const b = person(wire);
    await vi.waitFor(() => expect(b.lock.state).toBe("enter"));
    await b.lock.enter("wrong");
    expect(b.lock.error).toMatch(/not right/);
    expect(b.lock.state).toBe("enter");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(b.document.list()).toEqual([]);
  });

  it("waits while nobody can provide the envelope", async () => {
    const b = person(network());
    await b.lock.whenSynced;
    expect(b.lock.state).toBe("waiting");
    await b.lock.enter("anything");
    expect(b.document.list()).toEqual([]);
  });
});

describe("a password room over time", () => {
  it("restores from encrypted storage on this device with no peers", async () => {
    const storage = memoryStorage();
    const a = person(network(), true, storage);
    await a.lock.whenSynced;
    await a.lock.choose("right");
    const id = a.document.create("node", 0, 0, { name: SECRET });
    await vi.waitFor(() => expect(storage.saved.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const again = person(network(), false, storage);
    await again.lock.whenSynced;
    expect(again.lock.state).toBe("enter");
    expect(again.document.list()).toEqual([]);
    await again.lock.enter("right");
    expect(again.document.get(id)?.name).toBe(SECRET);
  });

  it("changes the password and keeps the document, for peers and for later joiners", async () => {
    const wire = network();
    const a = person(wire, true);
    await a.lock.whenSynced;
    await a.lock.choose("old");
    const id = a.document.create("node", 0, 0, { name: SECRET });
    const b = person(wire);
    await vi.waitFor(() => expect(b.lock.state).toBe("enter"));
    await b.lock.enter("old");
    await a.lock.changePassword("new");
    await vi.waitFor(() => expect((b.storage.stored() as Envelope | undefined)?.revision).toBe(2));
    a.document.patch(id, { x: 50 });
    await vi.waitFor(() => expect(b.document.get(id)?.x).toBe(50));

    const c = person(wire);
    await vi.waitFor(() => expect(c.lock.state).toBe("enter"));
    await c.lock.enter("old");
    expect(c.lock.state).toBe("enter");
    await c.lock.enter("new");
    await vi.waitFor(() => expect(c.document.get(id)?.name).toBe(SECRET));
  });
});

describe("what a password room refuses or seals", () => {
  it("ignores an envelope planted by someone without the key", async () => {
    const wire = network();
    const a = person(wire, true);
    await a.lock.whenSynced;
    await a.lock.choose("right");
    const original = a.storage.stored() as Envelope;
    const planted = await createEnvelope("attacker", await generateRoomKey(), 99);
    const raw = new Wire(wire.peers, wire.seen);
    raw.connected = true;
    raw.send(
      JSON.stringify({
        v: 1,
        from: "x",
        id: "y",
        kind: "envelope",
        target: "",
        index: 0,
        total: 1,
        data: JSON.stringify(planted),
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(a.storage.stored()).toEqual(original);
  });

  it("seals pictures, and cannot open them while locked", async () => {
    const a = person(network(), true);
    await a.lock.whenSynced;
    expect(() => a.lock.codec.seal(new Uint8Array([1]))).toThrow(/locked/);
    await a.lock.choose("right");
    const sealed = await a.lock.codec.seal(new Uint8Array([1, 2]));
    expect(sealed.length).toBeGreaterThan(2);
    expect([...(await a.lock.codec.open(sealed))]).toEqual([1, 2]);
  });

  it("merges a long history when opening", async () => {
    const storage = memoryStorage();
    const a = person(network(), true, storage);
    await a.lock.whenSynced;
    await a.lock.choose("right");
    const id = a.document.create("node", 0, 0);
    for (let x = 0; x < 120; x++) a.document.patch(id, { x });
    await vi.waitFor(() => expect(storage.saved.length).toBeGreaterThan(100));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const again = person(network(), false, storage);
    await again.lock.whenSynced;
    await again.lock.enter("right");
    expect(again.document.get(id)?.x).toBe(119);
    expect(storage.saved.length).toBeLessThan(5);
  });
});
