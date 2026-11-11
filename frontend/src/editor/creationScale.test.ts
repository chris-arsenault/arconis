import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { closestScale, inheritedFactor } from "./creationScale";

function canvas() {
  const document = new CanvasDocument();
  const add = (x: number, y: number, width: number, height: number, scale: number) =>
    document.create("node", x, y, { width, height, look: { scale } });
  return { document, add };
}

describe("the scale a new object takes", () => {
  it("is the closest object's", () => {
    const { document, add } = canvas();
    add(0, 0, 160, 90, 1);
    add(1000, 0, 40, 22, 0.25);
    expect(closestScale(document.list(), { x: 300, y: 40 })).toBe(1);
    expect(closestScale(document.list(), { x: 900, y: 40 })).toBe(0.25);
  });

  it("is the innermost object's when the point lies inside several", () => {
    const { document, add } = canvas();
    add(0, 0, 2000, 1000, 1);
    add(100, 100, 400, 300, 0.5);
    expect(closestScale(document.list(), { x: 200, y: 200 })).toBe(0.5);
    expect(closestScale(document.list(), { x: 1500, y: 800 })).toBe(1);
  });

  it("is 1 for an object that carries no scale, and nothing with no objects", () => {
    const document = new CanvasDocument();
    expect(closestScale(document.list(), { x: 0, y: 0 })).toBeNull();
    document.create("note", 0, 0);
    expect(closestScale(document.list(), { x: 500, y: 500 })).toBe(1);
  });

  it("follows the neighbour whatever the zoom, within what the window can show", () => {
    // Zoomed out to a quarter, the zoom alone would make objects four times their defaults.
    expect(inheritedFactor(4, 1)).toBe(1);
    expect(inheritedFactor(0.5, 1)).toBe(1);
    // With nothing near, or a neighbour far out of proportion with the window, the zoom decides.
    expect(inheritedFactor(4, null)).toBe(4);
    expect(inheritedFactor(1 / 64, 1)).toBe(1 / 64);
    expect(inheritedFactor(32, 1)).toBe(32);
  });
});
