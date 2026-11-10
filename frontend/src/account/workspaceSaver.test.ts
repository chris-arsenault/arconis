import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { SavedWorkspace } from "./accountStore";
import { AUTOSAVE_MS, WorkspaceSaver, type SaveableRoom } from "./workspaceSaver";
import type { SavedCopy } from "./workspaceFile";
import { WorkspaceConflict } from "./accountStore";

afterEach(() => vi.useRealTimers());

/** A room over a real document, and a store holding what a server would. */
function setup() {
  const doc = new Y.Doc();
  const server: { saved: SavedWorkspace | null; copy: SavedCopy | null } = {
    saved: null,
    copy: null,
  };
  let revisions = 0;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  const account = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    workspaces: vi.fn(() => Promise.resolve(server.saved ? [server.saved] : [])),
    save: vi.fn((id: string, name: string, copy: SavedCopy, expected: string) => {
      if (expected !== (server.saved?.revision ?? ""))
        return Promise.reject(new WorkspaceConflict("The workspace changed."));
      const revision = `r${++revisions}`;
      server.copy = copy;
      server.saved = { id, name, roomId: copy.roomId, size: 1, updated: 1, revision };
      return Promise.resolve(revision);
    }),
    load: vi.fn(() => Promise.resolve({ copy: server.copy!, revision: server.saved!.revision })),
  };
  const room: SaveableRoom = {
    id: "room",
    title: () => "Title",
    contents: () =>
      Promise.resolve({
        roomId: "room",
        envelope: { salt: "", iterations: 600000, wrapped: "", proof: "", revision: 1 },
        // This saver test double treats its opaque payload as the Yjs bytes directly.
        sealed: Y.encodeStateAsUpdate(doc),
      }),
    apply: (copy) => {
      Y.applyUpdate(doc, copy.sealed);
      return Promise.resolve();
    },
    onChange: (listener) => {
      doc.on("update", listener);
      return () => doc.off("update", listener);
    },
  };
  const saver = new WorkspaceSaver(account, room, () => {});
  return { doc, server, account, saver, room, changed };
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
    expect(saver.id).toBeNull();
    await saver.save();
    expect(saver.error).toBe("");
    expect(saver.id).not.toBeNull();
  });

  it("only marks a first save as retained after publication succeeds", async () => {
    const { account, saver } = setup();
    let publish!: (revision: string) => void;
    account.save.mockImplementationOnce(
      () => new Promise<string>((resolve) => (publish = resolve))
    );
    const saving = saver.save();
    await vi.waitFor(() => expect(account.save).toHaveBeenCalledOnce());
    expect(saver.id).toBeNull();
    publish("published");
    await saving;
    expect(saver.id).not.toBeNull();
  });
});

describe("retained copies", () => {
  it("autosaves edits made while the first publication is pending", async () => {
    vi.useFakeTimers();
    const { account, saver, doc, server } = setup();
    const publishSave = account.save.getMockImplementation()!;
    let publish!: () => void;
    account.save.mockImplementationOnce(
      (...args) =>
        new Promise<string>((resolve) => {
          publish = () => void publishSave(...args).then(resolve);
        })
    );
    const saving = saver.save();
    await vi.waitFor(() => expect(account.save).toHaveBeenCalledOnce());
    doc.getMap("m").set("during upload", 1);
    publish();
    await saving;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(account.save).toHaveBeenCalledTimes(2);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, server.copy!.sealed);
    expect(restored.getMap("m").get("during upload")).toBe(1);
    restored.destroy();
    saver.close();
  });

  it("stops autosaving a deleted copy and permits an explicit new save", async () => {
    vi.useFakeTimers();
    const { account, saver, doc, server, changed } = setup();
    await saver.save();
    const previousId = saver.id;
    doc.getMap("m").set("retained locally", 1);
    server.saved = null;
    server.copy = null;
    changed();
    await vi.waitFor(() => expect(saver.id).toBeNull());
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    expect(account.save).toHaveBeenCalledOnce();
    await saver.save();
    expect(saver.id).not.toBe(previousId);
    expect(saver.error).toBe("");
    expect(server.saved).not.toBeNull();
    saver.close();
  });

  it("recognizes deletion on another device before an autosave", async () => {
    vi.useFakeTimers();
    const { account, saver, doc, server } = setup();
    await saver.save();
    doc.getMap("m").set("retained locally", 1);
    server.saved = null;
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(saver.id).toBeNull();
    expect(account.save).toHaveBeenCalledOnce();
    await saver.save();
    expect(saver.error).toBe("");
    expect(server.saved).not.toBeNull();
    saver.close();
  });
});

describe("other devices", () => {
  it("retries a concurrent publication conflict through merge-before-save", async () => {
    const { saver, account } = setup();
    account.save.mockRejectedValueOnce(new WorkspaceConflict("The workspace changed."));
    await saver.save();
    expect(account.save).toHaveBeenCalledTimes(2);
    expect(saver.error).toBe("");
  });
  it("finds this room's saved copy and merges it on opening", async () => {
    const first = setup();
    first.doc.getMap("m").set("from first", 1);
    await first.saver.save();
    const second = setup();
    second.server.saved = first.server.saved;
    second.server.copy = first.server.copy;
    await second.saver.attach();
    expect(second.saver.id).toBe(first.saver.id);
    expect(second.doc.getMap("m").get("from first")).toBe(1);
  });

  it("merges a newer copy before saving, so neither device's work is lost", async () => {
    const { doc, server, saver, account } = setup();
    doc.getMap("m").set("here", 1);
    await saver.save();
    const stored = () => {
      const copy = server.copy!;
      return copy.sealed;
    };
    const elsewhere = new Y.Doc();
    Y.applyUpdate(elsewhere, stored());
    elsewhere.getMap("m").set("there", 2);
    server.copy = {
      roomId: "room",
      envelope: server.copy!.envelope,
      sealed: Y.encodeStateAsUpdate(elsewhere),
    };
    server.saved = { ...server.saved!, revision: "from another device" };
    await saver.save();
    expect(account.load).toHaveBeenCalledOnce();
    const merged = new Y.Doc();
    Y.applyUpdate(merged, stored());
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

it("preserves both independent editors when simultaneous saves compete for the same revision", async () => {
  const first = setup();
  first.doc.getMap("m").set("base", 1);
  await first.saver.save();
  const second = setup();
  const otherSaver = new WorkspaceSaver(first.account, second.room, () => {});
  try {
    await otherSaver.attach();
    first.doc.getMap("m").set("left", 2);
    second.doc.getMap("m").set("right", 3);
    await Promise.all([first.saver.save(), otherSaver.save()]);
    const stored = new Y.Doc();
    Y.applyUpdate(stored, first.server.copy!.sealed);
    expect(stored.getMap("m").toJSON()).toEqual({ base: 1, left: 2, right: 3 });
    expect(first.account.save).toHaveBeenCalledTimes(4);
    expect(first.saver.error).toBe("");
    expect(otherSaver.error).toBe("");
    stored.destroy();
  } finally {
    first.saver.close();
    otherSaver.close();
    second.saver.close();
    first.doc.destroy();
    second.doc.destroy();
  }
});
