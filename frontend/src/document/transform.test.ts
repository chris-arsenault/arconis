import { it, expect } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { simplifyPath } from "./geometry";
import { transformObjects } from "./transform";

const anchor = { x: 0, y: 0 };

it("scales shapes, drawings and inner routes around the anchor", () => {
  const document = new CanvasDocument();
  const shape = document.create("node", 100, 100, { width: 100, height: 50 });
  const stroke = document.create("drawing", 0, 0, {
    points: [
      [10, 20],
      [30, 40],
    ],
  });
  const result = transformObjects(document.list(), { anchor, scaleX: 2, scaleY: 3, angle: 0 });
  expect(result.get(shape)).toMatchObject({ x: 200, y: 300, width: 200, height: 150, rotation: 0 });
  expect(result.get(stroke)?.points).toEqual([
    [20, 60],
    [60, 120],
  ]);
  document.destroy();
});

it("rotates a drawing's gradient with its path and keeps unrelated source fields out of geometry writes", () => {
  const document = new CanvasDocument();
  const id = document.create("drawing", 0, 0, {
    name: "Human label",
    points: [
      [0, 0],
      [100, 0],
      [100, 50],
    ],
    look: { closed: true, fill: "#ff0000", gradient: "#0000ff", gradientAngle: 20 },
  });
  const transformed = transformObjects(document.list(), {
    anchor,
    scaleX: 1,
    scaleY: 1,
    angle: 90,
  }).get(id)!;
  expect(transformed).toMatchObject({
    paint: { gradientAngle: 110 },
    points: [
      [0, 0],
      [0, 100],
      [-50, 100],
    ],
  });
  expect(transformed).not.toHaveProperty("name");
  expect(transformed).not.toHaveProperty("look");
  document.destroy();
});

it("rotates shape centers, adds to their angle and refits group frames", () => {
  const document = new CanvasDocument();
  const group = document.create("group", 0, 0, { width: 300, height: 300 });
  const shape = document.create("node", 90, -20, {
    width: 20,
    height: 40,
    inside: group,
    look: { rotation: 350 },
  });
  const result = transformObjects(document.list(), { anchor, scaleX: 1, scaleY: 1, angle: 90 });
  const value = result.get(shape)!;
  expect(value.rotation).toBeCloseTo(80);
  expect(value.x + value.width / 2).toBeCloseTo(0);
  expect(value.y + value.height / 2).toBeCloseTo(100);
  const frame = result.get(group)!;
  expect(frame.width).toBeLessThan(150);
  expect(frame.x).toBeLessThan(value.x);
  document.destroy();
});

it("keeps vendor icons unrotated and evenly scaled through any transform", () => {
  const document = new CanvasDocument();
  const aws = document.create("node", 100, 100, {
    stencil: "icon",
    icon: "aws:AWS-Lambda",
  });
  const lucide = document.create("node", 200, 100, {
    stencil: "icon",
    icon: "lucide:Database",
  });
  const stretched = transformObjects(document.list(), { anchor, scaleX: 3, scaleY: 2, angle: 0 });
  expect(stretched.get(aws)).toMatchObject({ width: 128, height: 128 });
  expect(stretched.get(lucide)).toMatchObject({ width: 192, height: 128 });
  const turned = transformObjects(document.list(), { anchor, scaleX: 1, scaleY: 1, angle: 45 });
  expect(turned.get(aws)?.rotation).toBe(0);
  expect(turned.get(lucide)?.rotation).toBe(45);
  document.destroy();
});

it("stacks by order and breaks ties by id on every peer", () => {
  const document = new CanvasDocument();
  const low = document.create("node", 0, 0, { order: 1 });
  const high = document.create("node", 0, 0, { order: 2 });
  document.patch(low, { order: 3 });
  expect(document.list().map((item) => item.id)).toEqual([high, low]);
  document.patch(high, { order: 3 });
  expect(document.list().map((item) => item.id)).toEqual(
    [low, high].sort((left, right) => left.localeCompare(right))
  );
  document.destroy();
});

it("reduces redundant freehand samples within the tolerance", () => {
  const line: [number, number][] = [
    [0, 0],
    [1, 0.01],
    [2, 0],
    [3, 0.01],
    [4, 0],
    [4, 5],
  ];
  expect(simplifyPath(line, 0.5)).toEqual([
    [0, 0],
    [4, 0],
    [4, 5],
  ]);
});
