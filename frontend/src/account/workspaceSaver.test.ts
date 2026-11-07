import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { SavedWorkspace } from "./accountStore";
import { AUTOSAVE_MS, WorkspaceSaver, type SaveableRoom } from "./workspaceSaver";
import type { WorkspaceContents } from "./workspaceFile";

afterEach(() => vi.useRealTimers());

/** A room over a real document, and a store holding what a server would. */
function setup() {
  const doc = new Y.Doc();
  const server: { saved: SavedWorkspace | null; contents: WorkspaceContents | null } = {
    saved: null,
    contents: null,
  };
  let revisions = 0;
  const account = {
    workspaces: vi.fn(() => Promise.resolve(server.saved ? [server.saved] : [])),
    save: vi.fn((id: string, name: string, contents: WorkspaceContents) => {
      const revision = `r${++revisions}`;
      server.contents = contents;
      server.saved = { id, name, roomId: contents.roomId, size: 1, updated: 1, revision };
      return Promise.resolve(revision);
    }),
    load: vi.fn(() =>
      Promise.resolve({ contents: server.contents!, revision: server.saved!.revision })
    ),
  };
  const room: SaveableRoom = {
    id: "room",
    title: () => "Title",
    contents: () =>
      Promise.resolve({
        roomId: "room",
        update: Y.encodeStateAsUpdate(doc),
        pictures: [],
        envelope: null,
      }),
    apply: (contents) => {
      Y.applyUpdate(doc, contents.update);
      return Promise.resolve();
    },
    onChange: (listener) => {
      doc.on("update", listener);
      return () => doc.off("update", listener);
    },
  };
  const saver = new WorkspaceSaver(account, room, () => {});
  return { doc, server, account, saver };
}

describe("saving", () => {
  it("does nothing until someone chooses to save this room", async () => {
    vi.useFakeTimers();
    const { doc, account, saver } = setup();
    await saver.attach();
    doc.getMap("m").set("a", 1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    expect(account.save).not.toHaveBeenCalled();
  });

  it("saves on request, then again after edits go quiet", async () => {
    vi.useFakeTimers();
    const { doc, account, saver } = setup();
    await saver.save();
    expect(account.save).toHaveBeenCalledOnce();
    doc.getMap("m").set("a", 1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    doc.getMap("m").set("a", 2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(account.save).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(account.save).toHaveBeenCalledTimes(2);
  });

  it("reports a failed save and tries again on the next", async () => {
    const { account, saver } = setup();
    account.save.mockRejectedValueOnce(new Error("This account's storage is full."));
    await saver.save();
    expect(saver.error).toMatch(/full/);
    await saver.save();
    expect(saver.error).toBe("");
  });
});

describe("other devices", () => {
  it("finds this room's saved copy and merges it on opening", async () => {
    const first = setup();
    first.doc.getMap("m").set("from first", 1);
    await first.saver.save();
    const second = setup();
    second.server.saved = first.server.saved;
    second.server.contents = first.server.contents;
    await second.saver.attach();
    expect(second.saver.id).toBe(first.saver.id);
    expect(second.doc.getMap("m").get("from first")).toBe(1);
  });

  it("merges a newer copy before saving, so neither device's work is lost", async () => {
    const { doc, server, saver, account } = setup();
    doc.getMap("m").set("here", 1);
    await saver.save();
    const elsewhere = new Y.Doc();
    Y.applyUpdate(elsewhere, server.contents!.update);
    elsewhere.getMap("m").set("there", 2);
    server.contents = { ...server.contents!, update: Y.encodeStateAsUpdate(elsewhere) };
    server.saved = { ...server.saved!, revision: "from another device" };
    await saver.save();
    expect(account.load).toHaveBeenCalledOnce();
    const merged = new Y.Doc();
    Y.applyUpdate(merged, server.contents.update);
    expect(merged.getMap("m").toJSON()).toEqual({ here: 1, there: 2 });
  });

  it("does not download its own save again", async () => {
    const { saver, account } = setup();
    await saver.save();
    await saver.save();
    expect(account.load).not.toHaveBeenCalled();
  });
});

it("stops when closed", async () => {
  vi.useFakeTimers();
  const { doc, saver, account } = setup();
  await saver.save();
  doc.getMap("m").set("a", 1);
  saver.close();
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
  expect(account.save).toHaveBeenCalledOnce();
});
