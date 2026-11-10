import { expect, it } from "vitest";
import { facing, routeAround, type Box, type RouteEnd } from "./routing";

type Point = [number, number];

/** Whether a horizontal or vertical segment passes through the inside of a box. */
function crosses([ax, ay]: Point, [bx, by]: Point, box: Box) {
  const [left, right] = [Math.min(ax, bx), Math.max(ax, bx)];
  const [top, bottom] = [Math.min(ay, by), Math.max(ay, by)];
  return left < box.x + box.width && right > box.x && top < box.y + box.height && bottom > box.y;
}

const source: Box = { x: 0, y: 100, width: 100, height: 60 };
const sink: Box = { x: 600, y: 100, width: 100, height: 60 };
const wall: Box = { x: 250, y: 0, width: 100, height: 300 };
const start = facing(source, sink);
const end = facing(sink, source);
const whole = (corners: Point[], a: RouteEnd, b: RouteEnd): Point[] => [
  [a.x, a.y],
  ...corners,
  [b.x, b.y],
];

it("goes around what is between its ends, turning only at right angles", () => {
  const corners = routeAround(start, end, [wall], 10)!;
  expect(corners.length).toBeGreaterThan(0);
  const path = whole(corners, start, end);
  for (let index = 1; index < path.length; index++) {
    const [a, b] = [path[index - 1], path[index]];
    expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    expect(crosses(a, b, wall)).toBe(false);
  }
});

it("has no corners when nothing is in the way", () => {
  expect(routeAround(start, end, [], 10)).toEqual([]);
});

it("preserves routes around obstacles at millionfold zoom", () => {
  const factor = 2 ** -20;
  const scaled = (box: Box): Box => ({
    x: box.x * factor,
    y: box.y * factor,
    width: box.width * factor,
    height: box.height * factor,
  });
  const a = facing(scaled(source), scaled(sink));
  const b = facing(scaled(sink), scaled(source));
  const obstacle = scaled(wall);
  const corners = routeAround(a, b, [obstacle], 10 * factor)!;
  expect(corners).not.toBeNull();
  expect(corners.length).toBeGreaterThan(0);
  const path = whole(corners, a, b);
  for (let index = 1; index < path.length; index++) {
    const [left, right] = [path[index - 1], path[index]];
    expect(left[0] === right[0] || left[1] === right[1]).toBe(true);
    expect(crosses(left, right, obstacle)).toBe(false);
  }
});

it("gives every peer the same route", () => {
  const obstacles = [wall, { x: 400, y: 50, width: 50, height: 200 }];
  const first = routeAround(start, end, obstacles, 10);
  expect(routeAround(start, end, [...obstacles].reverse(), 10)).toEqual(first);
});

it("passes over a neighbor covering where it leaves, which it cannot avoid", () => {
  const neighbor: Box = { x: 95, y: 110, width: 40, height: 40 };
  expect(routeAround(start, end, [neighbor], 10)).toEqual([]);
});

it("reports no route when an end is walled in on every side", () => {
  const walls: Box[] = [
    { x: -60, y: 40, width: 260, height: 20 },
    { x: -60, y: 200, width: 260, height: 20 },
    { x: -60, y: 40, width: 20, height: 180 },
    { x: 180, y: 40, width: 20, height: 180 },
  ];
  expect(routeAround(start, end, walls, 10)).toBeNull();
});
