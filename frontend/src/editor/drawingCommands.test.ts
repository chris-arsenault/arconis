import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { fitDrawing, makeDrawing, resizeDrawing, returnToMarkup } from "./drawingCommands";
import { recolorInk } from "./inkCommands";

it("promotes without changing ink, scales contents with numeric bounds, and demotes with Undo", () => {
  const canvas = new CanvasDocument();
  canvas.create("drawing", 0, 0, {
    id: "p",
    markup: true,
    points: [
      [10, 20],
      [110, 70],
    ],
    look: { strokeOpacity: 30, lineWidth: 16 },
  });
  const original = canvas.get("p")!;
  const id = makeDrawing(canvas, [original], { x: 0, y: 0 });
  expect(canvas.get("p")).toMatchObject({
    points: original.points,
    look: original.look,
    inside: id,
    markup: false,
  });
  const sketch = canvas.get(id)!;
  resizeDrawing(canvas, sketch, "width", sketch.width * 2);
  expect(canvas.get("p")?.points).toEqual([
    [30, 20],
    [230, 70],
  ]);
  expect(canvas.get("p")?.look).toEqual(original.look);
  expect(canvas.get(id)?.look).toEqual(sketch.look);
  canvas.undo.undo();
  expect(canvas.get("p")?.points).toEqual(original.points);
  returnToMarkup(canvas, canvas.get(id)!);
  expect(canvas.get(id)).toBeNull();
  expect(canvas.get("p")).toMatchObject({ inside: "", markup: true });
  canvas.undo.undo();
  expect(canvas.get("p")?.inside).toBe(id);
});

it("preserves the full painted width on promotion and Fit, including named-style brush scale", () => {
  const canvas = new CanvasDocument();
  canvas.setStyle("wide", { lineWidth: 96, scale: 0.5 });
  const id = canvas.create("drawing", 0, 0, {
    markup: true,
    style: "wide",
    points: [
      [80, 90],
      [240, 130],
    ],
  });
  const before = canvas.get(id)!;
  const drawing = makeDrawing(canvas, [before], { x: 0, y: 0 });
  expect(canvas.get(drawing)).toMatchObject({ x: 44, y: 54, width: 232, height: 112 });
  expect(canvas.get(id)?.points).toEqual(before.points);
  expect(canvas.get(id)?.look).toEqual(before.look);
  canvas.patch(drawing, { x: 0, y: 0, width: 500, height: 500 });
  fitDrawing(canvas, canvas.get(drawing)!);
  expect(canvas.get(drawing)).toMatchObject({ x: 44, y: 54, width: 232, height: 112 });
  canvas.destroy();
});

it("recolors ink without changing a selected workspace object", () => {
  const canvas = new CanvasDocument();
  const node = canvas.create("node", 0, 0, { look: { line: "#112233" } });
  const path = canvas.create("drawing", 0, 0, {
    markup: true,
    points: [
      [0, 0],
      [10, 10],
    ],
  });
  const before = canvas.get(node);
  recolorInk(canvas, canvas.list(), "#ff0000");
  expect(canvas.get(node)).toEqual(before);
  expect(canvas.get(path)?.look.line).toBe("#ff0000");
  canvas.undo.undo();
  expect(canvas.get(path)?.look.line).toBeUndefined();
  expect(canvas.get(node)).toEqual(before);
  canvas.destroy();
});

it("numeric Drawing resizing preserves inherited rotation without authoring overrides", () => {
  const canvas = new CanvasDocument();
  canvas.setStyle("turned", { rotation: 30 });
  const id = canvas.create("sketch", 0, 0, { style: "turned", width: 100, height: 100 });
  const path = canvas.create("drawing", 0, 0, {
    inside: id,
    points: [
      [10, 10],
      [90, 90],
    ],
  });
  resizeDrawing(canvas, canvas.get(id)!, "width", 200);
  expect(canvas.get(id)?.look).toEqual({});
  expect(canvas.get(path)?.look).toEqual({});
  expect(canvas.get(path)?.points).toEqual([
    [20, 10],
    [180, 90],
  ]);
  canvas.destroy();
});
