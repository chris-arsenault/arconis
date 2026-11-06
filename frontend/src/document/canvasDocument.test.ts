import { it, expect } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import { importDocument } from "./files";

function exchange(a: CanvasDocument, b: CanvasDocument) {
  const aUpdate = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const bUpdate = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(a.doc, bUpdate);
  Y.applyUpdate(b.doc, aUpdate);
}

it("omits concurrent connectors whose endpoint was deleted without losing unrelated objects", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const source = a.create("rectangle", 0, 0);
  const target = a.create("sticky", 200, 0);
  exchange(a, b);
  a.remove([source]);
  b.create("connector", 0, 0, { source, target });
  exchange(a, b);
  expect(a.list()).toEqual(b.list());
  expect(a.list().map((item) => item.id)).toEqual([target]);
  a.destroy();
  b.destroy();
});
it("retains a connector until its out-of-order endpoint objects arrive", () => {
  const source = new CanvasDocument();
  const first = source.create("rectangle", 0, 0);
  const second = source.create("sticky", 200, 0);
  const target = new CanvasDocument();
  target.create("connector", 0, 0, { source: first, target: second });
  expect(target.list()).toHaveLength(0);
  target.doc.transact(() => source.list().forEach((item) => target.insert(item)));
  expect(target.list()).toHaveLength(3);
  source.destroy();
  target.destroy();
});
it("merges independent geometry, style and collaborative text changes", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("sticky", 20, 30, { label: "idea" });
  exchange(a, b);
  a.patch(id, { x: 210 });
  b.patch(id, { y: 180 });
  a.patchStyle(id, { fillColor: "#ffd9da" });
  b.patchStyle(id, { fontSize: 24 });
  a.text(id)!.insert(0, "Our ");
  b.text(id)!.insert(4, " grows");
  exchange(a, b);
  expect(a.list()).toEqual(b.list());
  expect(a.get(id)).toMatchObject({
    x: 210,
    y: 180,
    label: "Our idea grows",
    style: { fillColor: "#ffd9da", fontSize: 24 },
  });
  a.destroy();
  b.destroy();
});
it("deletes dependent connectors and retains unrelated objects", () => {
  const document = new CanvasDocument();
  const shape = document.create("database", 0, 0);
  const note = document.create("sticky", 300, 0);
  document.create("connector", 0, 0, { source: shape, target: note });
  document.remove([shape]);
  expect(document.list().map((item) => item.id)).toEqual([note]);
  document.destroy();
});
it("undoes local changes without undoing concurrent peer work", () => {
  const a = new CanvasDocument();
  const b = new CanvasDocument();
  const id = a.create("rectangle", 0, 0);
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
it("restores a portable mixed document with remapped relationships", () => {
  const a = new CanvasDocument();
  const shape = a.create("rectangle", 20, 30, { label: "API" });
  const note = a.create("sticky", 300, 20, { label: "Idea" });
  a.create("connector", 0, 0, { source: shape, target: note });
  const b = new CanvasDocument();
  importDocument(b, JSON.stringify({ format: "arconis", version: 1, objects: a.list() }));
  const edge = b.list().find((item) => item.kind === "connector")!;
  expect(b.get(edge.source)?.label).toBe("API");
  expect(b.get(edge.target)?.label).toBe("Idea");
  expect(() => importDocument(b, '{"format":"arconis","objects":[{}]}')).toThrow(
    "invalid canvas objects"
  );
  a.destroy();
  b.destroy();
});
