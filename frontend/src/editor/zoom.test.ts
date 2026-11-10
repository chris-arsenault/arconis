import { describe, expect, it } from "vitest";
import { clampScale, MIN_SCALE, MAX_SCALE, ZOOM_STEP, zoomLabel } from "./zoom";
import { transformObjects } from "../document/transform";
import { CanvasDocument } from "../document/canvasDocument";
import { printCanvas } from "../language/printer";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";

describe("zoom precision", () => {
  it("has equal travel either side of normal and four steps per doubling", () => {
    expect(MIN_SCALE * MAX_SCALE).toBe(1);
    expect(ZOOM_STEP ** 4).toBeCloseTo(2, 14);
    expect(zoomLabel(1)).toBe("1×");
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(1e-20)).toBe(MIN_SCALE);
  });

  it("preserves subpixel transforms and file coordinates at the deepest zoom", () => {
    const document = new CanvasDocument();
    const id = document.create("node", 400, 300, {
      width: 160 / MAX_SCALE,
      height: 90 / MAX_SCALE,
    });
    const item = document.get(id)!;
    const change = transformObjects([item], {
      anchor: { x: item.x, y: item.y },
      scaleX: 0.5,
      scaleY: 0.5,
      angle: 0,
      offset: { x: 1 / MAX_SCALE, y: 0 },
    }).get(id)!;
    expect(change.width * MAX_SCALE).toBeCloseTo(80, 6);
    document.patch(id, change);
    const copy = new CanvasDocument();
    writeStatements(copy, parse(printCanvas(document)), { importing: true, author: "" });
    expect(copy.get(id)!.x).toBe(document.get(id)!.x);
    expect(copy.get(id)!.width).toBe(document.get(id)!.width);
  });
});
