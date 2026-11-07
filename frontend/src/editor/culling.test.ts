import { Cell, Geometry, Point } from "@maxgraph/core";
import { describe, expect, it } from "vitest";
import { hasHiddenDetail, isCulled, labelIsLegible } from "./culling";

function vertex(width: number, height: number, parent?: Cell) {
  const cell = new Cell("", new Geometry(0, 0, width, height));
  cell.setVertex(true);
  if (parent) parent.insert(cell);
  return cell;
}

function edge(source: Cell | null, target: Cell | null, points: [number, number][] = []) {
  const geometry = new Geometry();
  geometry.points = points.map(([x, y]) => new Point(x, y));
  const cell = new Cell("", geometry);
  cell.setEdge(true);
  cell.source = source;
  cell.target = target;
  return cell;
}

describe("culling", () => {
  it("hides an object once its longer side is under the threshold on screen", () => {
    const box = vertex(100, 10);
    expect(isCulled(box, 1)).toBe(false);
    expect(isCulled(box, 0.05)).toBe(false);
    expect(isCulled(box, 0.03)).toBe(true);
  });

  it("hides everything held by a hidden object, however large it is itself", () => {
    const parent = vertex(100, 100);
    const child = vertex(200, 200, parent);
    expect(isCulled(child, 0.03)).toBe(true);
    expect(isCulled(child, 1)).toBe(false);
  });

  it("hides a connector with either end, and keeps it otherwise", () => {
    const [large, small] = [vertex(100, 100), vertex(10, 10)];
    expect(isCulled(edge(large, small), 0.1)).toBe(true);
    expect(isCulled(edge(large, vertex(100, 100)), 0.1)).toBe(false);
  });

  it("measures a drawing by its own extent", () => {
    const stroke = edge(null, null, [
      [0, 0],
      [100, 20],
    ]);
    expect(isCulled(stroke, 1)).toBe(false);
    expect(isCulled(stroke, 0.03)).toBe(true);
  });

  it("reports detail hidden inside an object still drawn", () => {
    const parent = vertex(100, 100);
    expect(hasHiddenDetail(parent, 1)).toBe(false);
    vertex(1, 1, parent);
    expect(hasHiddenDetail(parent, 1)).toBe(true);
    expect(hasHiddenDetail(parent, 10)).toBe(false);
  });

  it("hides labels too small to read before the object itself", () => {
    const box = vertex(100, 100);
    box.setStyle({ fontSize: 14 });
    expect(labelIsLegible(box, 1)).toBe(true);
    expect(labelIsLegible(box, 0.1)).toBe(false);
    expect(isCulled(box, 0.1)).toBe(false);
  });
});
