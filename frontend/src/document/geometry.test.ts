import { it, expect } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import { importDocument } from "./files";
import type { CanvasObject } from "./types";

function legacyObjects() {
  const document = new CanvasDocument();
  const group = document.create("group", 100, 120, { label: "Outer" });
  const nested = document.create("group", 20, 30, { parent: group, label: "Inner" });
  const shape = document.create("rectangle", 5, 7, { parent: nested, label: "Shape" });
  const note = document.create("sticky", 200, 100, { parent: nested, label: "Note" });
  document.create("connector", 0, 0, {
    parent: nested,
    source: shape,
    target: note,
    label: "Route",
    points: "[[10,20],[30,40]]",
  });
  const objects = document.list();
  document.destroy();
  return objects;
}

function loadLegacy(document: CanvasDocument, objects: CanvasObject[]) {
  document.doc.transact(() =>
    objects.forEach((item) => {
      const { label, style, ...fields } = item;
      const record = new Y.Map<unknown>(Object.entries(fields));
      document.objects.set(item.id, record);
      const text = new Y.Text();
      record.set("label", text);
      text.insert(0, label);
      record.set("style", new Y.Map(Object.entries(style)));
    })
  );
}

function exchange(a: CanvasDocument, b: CanvasDocument) {
  const fromA = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const fromB = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(a.doc, fromB);
  Y.applyUpdate(b.doc, fromA);
}

it("reads existing nested room records without changing their geometry", () => {
  const document = new CanvasDocument();
  loadLegacy(document, legacyObjects());
  expect(document.list().find((item) => item.label === "Shape")).toMatchObject({ x: 125, y: 157 });
  expect(document.list().find((item) => item.label === "Route")?.points).toBe(
    "[[130,170],[150,190]]"
  );
  document.doc.transact(() => document.freezeLegacyGeometry());
  expect(document.list().find((item) => item.label === "Shape")).toMatchObject({ x: 125, y: 157 });
  document.destroy();
});

it.each([100, 200])(
  "preserves a real legacy movement over reparenting at peer priority %s",
  (priority) => {
    const a = new CanvasDocument();
    const b = new CanvasDocument();
    a.doc.clientID = priority;
    b.doc.clientID = 300 - priority;
    const objects = legacyObjects();
    loadLegacy(a, objects);
    exchange(a, b);
    const shape = objects.find((item) => item.label === "Shape")!;
    const group = objects.find((item) => item.label === "Outer")!;
    a.patch(shape.id, { parent: group.id });
    b.patch(shape.id, { x: 150, y: 180 });
    exchange(a, b);
    expect(a.get(shape.id)).toMatchObject({ x: 150, y: 180, parent: group.id });
    expect(a.list()).toEqual(b.list());
    a.destroy();
    b.destroy();
  }
);

it("normalizes version-one nested files and preserves world geometry in version-two round trips", () => {
  const first = new CanvasDocument();
  importDocument(
    first,
    JSON.stringify({ format: "arconis", version: 1, objects: legacyObjects() })
  );
  expect(first.list().find((item) => item.label === "Shape")).toMatchObject({ x: 125, y: 157 });
  expect(first.list().find((item) => item.label === "Route")?.points).toBe("[[130,170],[150,190]]");
  const second = new CanvasDocument();
  importDocument(second, JSON.stringify({ format: "arconis", version: 2, objects: first.list() }));
  expect(second.list().map(({ label, x, y, points }) => ({ label, x, y, points }))).toEqual(
    first.list().map(({ label, x, y, points }) => ({ label, x, y, points }))
  );
  first.destroy();
  second.destroy();
});
