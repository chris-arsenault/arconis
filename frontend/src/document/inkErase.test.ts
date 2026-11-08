import { expect, it } from "vitest";
import { cutInk } from "./inkErase";
import { CanvasDocument } from "./canvasDocument";
import { eraseInk } from "../editor/inkCommands";

it("cuts the middle of a sparse two-point stroke without losing its surviving ends", () => {
  const pieces = cutInk(
    [
      [0, 0],
      [100, 0],
    ],
    [
      [50, -10],
      [50, 10],
    ],
    8
  );
  expect(pieces).toHaveLength(2);
  expect(pieces[0][0]).toEqual([0, 0]);
  expect(pieces[0].at(-1)![0]).toBeLessThan(42);
  expect(pieces[1][0][0]).toBeGreaterThan(58);
  expect(pieces[1].at(-1)).toEqual([100, 0]);
});

it("publishes all surviving segments as one completed action and restores the original on Undo", () => {
  const canvas = new CanvasDocument();
  canvas.create("drawing", 0, 0, {
    id: "stroke",
    markup: true,
    points: [
      [0, 0],
      [100, 0],
    ],
    look: { line: "#ffee00", strokeOpacity: 30 },
  });
  let completed = 0;
  canvas.actions.subscribe(() => completed++);
  eraseInk(
    canvas,
    canvas.list(),
    [
      [50, -10],
      [50, 10],
    ],
    8
  );
  expect(completed).toBe(1);
  expect(canvas.list()).toHaveLength(2);
  expect(canvas.list().every((item) => item.look.strokeOpacity === 30 && item.markup)).toBe(true);
  canvas.undo.undo();
  expect(canvas.get("stroke")?.points).toEqual([
    [0, 0],
    [100, 0],
  ]);
  expect(canvas.list()).toHaveLength(1);
});
