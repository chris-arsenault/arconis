import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { makeDrawing, resizeDrawing, returnToMarkup } from "./drawingCommands";

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
    [22, 20],
    [222, 70],
  ]);
  canvas.undo.undo();
  expect(canvas.get("p")?.points).toEqual(original.points);
  returnToMarkup(canvas, canvas.get(id)!);
  expect(canvas.get(id)).toBeNull();
  expect(canvas.get("p")).toMatchObject({ inside: "", markup: true });
  canvas.undo.undo();
  expect(canvas.get("p")?.inside).toBe(id);
});
