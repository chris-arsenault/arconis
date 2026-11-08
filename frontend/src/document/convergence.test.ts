import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";

/** Two documents exchange what the other lacks, as peers do once a connection returns. */
function exchange(a: CanvasDocument, b: CanvasDocument) {
  const aUpdate = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const bUpdate = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(a.doc, bUpdate, "remote");
  Y.applyUpdate(b.doc, aUpdate, "remote");
}

describe("what two people did apart, once they meet again", () => {
  it("stacks objects identically on every peer, and a reorder by one reaches the other", () => {
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const seed = a.create("node", 700, 600, { name: "Seed" });
    exchange(a, b);
    // Apart, both create at the same stacking position; ids break the tie the same way everywhere.
    const under = a.create("node", 220, 170, { name: "Under" });
    const over = b.create("node", 260, 200, { name: "Over" });
    exchange(a, b);
    expect(a.get(under)!.order).toBe(a.get(over)!.order);
    expect(a.list().map((item) => item.id)).toEqual(b.list().map((item) => item.id));
    expect(a.list()[0].id).toBe(seed);
    // Bringing one to the front gives it a position above everything, which peers see alike.
    const top = a.list().at(-1)!.id;
    const beneath = top === under ? over : under;
    a.patch(beneath, { order: a.nextOrder() });
    exchange(a, b);
    expect(a.list().at(-1)!.id).toBe(beneath);
    expect(b.list().map((item) => item.id)).toEqual(a.list().map((item) => item.id));
    a.destroy();
    b.destroy();
  });

  it("brings back a deleted object with both people's text when the deletion is undone", () => {
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    const id = a.create("note", 0, 0, { name: "ab" });
    exchange(a, b);
    b.editText(id, "ab!");
    exchange(a, b);
    a.editText(id, "a漢b!");
    exchange(a, b);
    expect(b.get(id)!.name).toBe("a漢b!");
    a.undo.undo();
    exchange(a, b);
    expect(b.get(id)!.name).toBe("ab!");
    b.remove([id]);
    exchange(a, b);
    expect(a.get(id)).toBeNull();
    b.undo.undo();
    exchange(a, b);
    expect(a.get(id)!.name).toBe("ab!");
    expect(b.get(id)!.name).toBe("ab!");
    a.destroy();
    b.destroy();
  });
});
