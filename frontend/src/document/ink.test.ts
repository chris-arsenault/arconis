import { expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { highlighted } from "./ink";
import { pointInBox } from "./geometry";
import { effectiveAppearance } from "./appearance";

it("derives highlight bounds and stroke scale from tiny targets while preserving explicit style overrides", () => {
  const canvas = new CanvasDocument();
  const target = canvas.build("note", 1, 2, {
    id: "n",
    width: 0.2,
    height: 0.1,
    look: { scale: 0.001, rotation: 45 },
  });
  const outline = canvas.build("highlight", 0, 0, { target: "n", markup: true });
  const targets = new Map([[target.id, target]]);
  const derived = highlighted(outline, targets);
  expect(derived.x).toBeCloseTo(0.995);
  expect(derived.width).toBeCloseTo(0.21);
  expect(derived.look).toMatchObject({ scale: 0.001, rotation: 45 });
  expect(outline.look).toEqual({});
  expect(highlighted(outline, targets, new Set(), { scale: 0.5 }).look.scale).toBe(0.5);
});

it("picks the displayed rotated target and rejects its former unrotated footprint", () => {
  const canvas = new CanvasDocument();
  const target = canvas.build("node", 200, 200, { width: 200, height: 40 });
  const look = effectiveAppearance(target, { rotation: 90 });
  expect(pointInBox(target, [300, 150], look)).toBe(true);
  expect(pointInBox(target, [250, 220], look)).toBe(false);
  expect(pointInBox(target, [300, 300], look)).toBe(true);
  canvas.destroy();
});
