import { it, expect } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import { importDocument, serializeDocument } from "../files/canvasFile";

function exchange(a: CanvasDocument, b: CanvasDocument) {
  const aUpdate = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const bUpdate = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(a.doc, bUpdate);
  Y.applyUpdate(b.doc, aUpdate);
}

it("keeps mutable defaults independent between newly built items", () => {
  const document = new CanvasDocument();
  const first = document.build("note", 0, 0);
  const second = document.build("note", 200, 0);
  first.tags.push("review");
  first.properties.owner = "Ada";
  first.look.fill = "#ffd9da";
  first.points.push([10, 20]);
  expect(second).toMatchObject({ tags: [], properties: {}, look: {}, points: [] });
  document.insert(first);
  document.insert(second);
  const copy = new CanvasDocument();
  importDocument(copy, serializeDocument(document));
  expect(copy.get(first.id)?.tags).toEqual(["review"]);
  expect(copy.get(second.id)).toMatchObject({ tags: [], properties: {}, look: {} });
  document.destroy();
  copy.destroy();
});

it("reuses unchanged list entries while text, look, undo and peer changes invalidate their item", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("note", 0, 0, { name: "First" });
  const other = a.create("node", 300, 0);
  const before = a.list();
  const untouched = before.find((item) => item.id === other);
  a.text(id)!.insert(0, "Our ");
  expect(a.list().find((item) => item.id === id)?.name).toBe("Our First");
  expect(a.list().find((item) => item.id === other)).toBe(untouched);
  a.patchLook(id, { fill: "#ffd9da" });
  expect(a.list().find((item) => item.id === id)?.look.fill).toBe("#ffd9da");
  a.undo.undo();
  expect(a.list().find((item) => item.id === id)?.look.fill).toBeUndefined();
  exchange(a, b);
  b.patch(id, { x: 120 });
  exchange(a, b);
  expect(a.list().find((item) => item.id === id)?.x).toBe(120);
  expect(a.list().find((item) => item.id === other)).toBe(untouched);
  a.destroy();
  b.destroy();
});

it("reads live item fields within a transaction even after its list was cached", () => {
  const document = new CanvasDocument();
  const id = document.create("node", 0, 0, { name: "Before" });
  document.list();
  document.doc.transact(() => {
    document.patch(id, { x: 20 });
    expect(document.list()[0].x).toBe(20);
    document.text(id)!.insert(0, "Live ");
    expect(document.list()[0].name).toBe("Live Before");
  });
  expect(document.list()[0]).toMatchObject({ x: 20, name: "Live Before" });
  document.destroy();
});

it("omits concurrent lines whose end was deleted without losing unrelated items", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const from = a.create("node", 0, 0);
  const to = a.create("note", 200, 0);
  exchange(a, b);
  a.remove([from]);
  b.create("line", 0, 0, { from, to });
  exchange(a, b);
  expect(a.list()).toEqual(b.list());
  expect(a.list().map((item) => item.id)).toEqual([to]);
  a.destroy();
  b.destroy();
});
it("retains a line until its out-of-order ends arrive", () => {
  const source = new CanvasDocument();
  const first = source.create("node", 0, 0);
  const second = source.create("note", 200, 0);
  const target = new CanvasDocument();
  target.create("line", 0, 0, { from: first, to: second });
  expect(target.list()).toHaveLength(0);
  target.doc.transact(() => source.list().forEach((item) => target.insert(item)));
  expect(target.list()).toHaveLength(3);
  source.destroy();
  target.destroy();
});
it("merges independent geometry, look and collaborative text changes", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("note", 20, 30, { name: "idea" });
  exchange(a, b);
  a.patch(id, { x: 210 });
  b.patch(id, { y: 180 });
  a.patchLook(id, { fill: "#ffd9da" });
  b.patchLook(id, { textSize: 24 });
  a.text(id)!.insert(0, "Our ");
  b.text(id)!.insert(4, " grows");
  exchange(a, b);
  expect(a.list()).toEqual(b.list());
  expect(a.get(id)).toMatchObject({
    x: 210,
    y: 180,
    name: "Our idea grows",
    look: { fill: "#ffd9da", textSize: 24 },
  });
  a.destroy();
  b.destroy();
});
it("deletes dependent lines and retains unrelated items", () => {
  const document = new CanvasDocument();
  const shape = document.create("node", 0, 0, { stencil: "database" });
  const note = document.create("note", 300, 0);
  document.create("line", 0, 0, { from: shape, to: note });
  document.remove([shape]);
  expect(document.list().map((item) => item.id)).toEqual([note]);
  document.destroy();
});
it("undoes local changes without undoing concurrent peer work", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("node", 0, 0);
  exchange(a, b);
  a.patch(id, { x: 120 });
  b.patch(id, { y: 240 });
  exchange(a, b);
  a.undo.undo();
  exchange(a, b);
  expect(a.get(id)).toMatchObject({ x: 0, y: 240 });
  a.destroy();
  b.destroy();
});
it("ignores records a peer wrote in an unknown shape", () => {
  const document = new CanvasDocument();
  document.doc.transact(() => document.items.set("odd", new Y.Map([["kind", "rectangle"]])));
  expect(document.list()).toEqual([]);
  document.destroy();
});
it("carries a canvas through a file, keeping relationships", () => {
  const a = new CanvasDocument();
  const shape = a.create("node", 20, 30, { name: "API" });
  const note = a.create("note", 300, 20, { name: "Idea" });
  a.create("line", 0, 0, { from: shape, to: note });
  const b = new CanvasDocument();
  importDocument(b, serializeDocument(a));
  const line = b.list().find((item) => item.type === "line")!;
  expect(b.get(line.from)?.name).toBe("API");
  expect(b.get(line.to)?.name).toBe("Idea");
  expect(() => importDocument(b, '{"format":"arconis"}')).toThrow();
  expect(() => importDocument(b, "node a")).toThrow("Choose an Arconis canvas file");
  a.destroy();
  b.destroy();
});
