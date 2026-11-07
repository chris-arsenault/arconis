/**
 * Orthogonal routes around obstacles. A line leaves its start through a short stub, travels along
 * the edges of the boxes in its way and arrives through a stub at its end, preferring fewer bends.
 * The result depends only on its input, so every peer draws the same route.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Side = "top" | "bottom" | "left" | "right";
export interface RouteEnd {
  x: number;
  y: number;
  side: Side;
}
type Point = [number, number];

const NORMALS: Record<Side, Point> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
/** A bend costs as much as this much extra length, so routes prefer fewer turns. */
const BEND_COST = 40;

function stub(end: RouteEnd, margin: number): Point {
  const [nx, ny] = NORMALS[end.side];
  return [end.x + nx * margin, end.y + ny * margin];
}

function inside([x, y]: Point, boxes: Box[]) {
  return boxes.some(
    (box) => x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height
  );
}

/** Sorted distinct values. */
function axis(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

interface Grid {
  xs: number[];
  ys: number[];
  open: boolean[];
}

function grid(start: Point, end: Point, boxes: Box[]): Grid {
  const xs = axis([start[0], end[0], ...boxes.flatMap((box) => [box.x, box.x + box.width])]);
  const ys = axis([start[1], end[1], ...boxes.flatMap((box) => [box.y, box.y + box.height])]);
  const open = xs.flatMap((x) => ys.map((y) => !inside([x, y], boxes)));
  return { xs, ys, open };
}

/** A tiny binary heap of [cost, state] pairs. */
class Queue {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, state: number) {
    const items = this.items;
    items.push([cost, state]);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent][0] <= items[index][0]) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

/** Steps along the grid: right, left, down, up. */
const STEPS: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * The cheapest grid path between two cells, by length plus a cost per bend. States are a cell and
 * the direction it was entered in, so bends are counted exactly.
 */
function search(g: Grid, from: Point, to: Point, boxes: Box[]) {
  const columns = g.ys.length;
  const cell = (i: number, j: number) => i * columns + j;
  const start = cell(g.xs.indexOf(from[0]), g.ys.indexOf(from[1]));
  const goal = cell(g.xs.indexOf(to[0]), g.ys.indexOf(to[1]));
  const best = new Map<number, number>();
  const previous = new Map<number, number>();
  const queue = new Queue();
  for (let direction = 0; direction < 4; direction++) {
    best.set(start * 4 + direction, 0);
    queue.push(0, start * 4 + direction);
  }
  while (queue.size) {
    const [cost, state] = queue.pop();
    if (cost > (best.get(state) ?? Infinity)) continue;
    const here = Math.floor(state / 4);
    if (here === goal) return unwind(previous, state, g, columns);
    const [i, j] = [Math.floor(here / columns), here % columns];
    STEPS.forEach(([di, dj], direction) => {
      const length = stepLength(g, boxes, [i, j], [i + di, j + dj]);
      if (length === null) return;
      const bend = here !== start && direction !== state % 4 ? BEND_COST : 0;
      const next = cell(i + di, j + dj) * 4 + direction;
      const total = cost + length + bend;
      if (total >= (best.get(next) ?? Infinity)) return;
      best.set(next, total);
      previous.set(next, state);
      queue.push(total, next);
    });
  }
  return null;
}

/** The length of a step between neighboring grid cells, or null when it is off the grid or blocked. */
function stepLength(g: Grid, boxes: Box[], [i, j]: Point, [ni, nj]: Point) {
  const columns = g.ys.length;
  if (ni < 0 || nj < 0 || ni >= g.xs.length || nj >= columns) return null;
  if (!g.open[ni * columns + nj]) return null;
  const middle: Point = [(g.xs[i] + g.xs[ni]) / 2, (g.ys[j] + g.ys[nj]) / 2];
  if (inside(middle, boxes)) return null;
  return Math.abs(g.xs[ni] - g.xs[i]) + Math.abs(g.ys[nj] - g.ys[j]);
}

function unwind(previous: Map<number, number>, state: number, g: Grid, columns: number) {
  const path: Point[] = [];
  for (
    let current: number | undefined = state;
    current !== undefined;
    current = previous.get(current)
  ) {
    const here = Math.floor(current / 4);
    path.unshift([g.xs[Math.floor(here / columns)], g.ys[here % columns]]);
  }
  return path;
}

/** Drops points in the middle of straight runs. */
function corners(path: Point[]) {
  return path.filter((point, index) => {
    const before = path[index - 1];
    const after = path[index + 1];
    if (!before || !after) return true;
    const straight =
      (before[0] === point[0] && point[0] === after[0]) ||
      (before[1] === point[1] && point[1] === after[1]);
    return !straight;
  });
}

/**
 * The corners of a line from `start` to `end` around `obstacles`, each grown by `margin`, leaving
 * out the ends themselves. Returns null when no route exists, so the line keeps its own course. An
 * obstacle already covering where a line leaves or arrives, such as a neighbor's label beside it,
 * cannot be avoided and is not.
 */
export function routeAround(start: RouteEnd, end: RouteEnd, obstacles: Box[], margin: number) {
  const round = (point: Point): Point => [
    Math.round(point[0] * 1000) / 1000,
    Math.round(point[1] * 1000) / 1000,
  ];
  const from = round(stub(start, margin));
  const to = round(stub(end, margin));
  const grown = obstacles
    .map((box) => ({
      x: box.x - margin,
      y: box.y - margin,
      width: box.width + margin * 2,
      height: box.height + margin * 2,
    }))
    .filter((box) => !inside(from, [box]) && !inside(to, [box]));
  const path = search(grid(from, to, grown), from, to, grown);
  if (!path) return null;
  // The ends join the path so straight runs through them are not counted as corners.
  return corners([[start.x, start.y], ...path, [end.x, end.y]]).slice(1, -1);
}

/** The side of a box a point on or near its edge faces. */
export function sideOf(box: Box, x: number, y: number): Side {
  const distances: [Side, number][] = [
    ["left", Math.abs(x - box.x)],
    ["right", Math.abs(box.x + box.width - x)],
    ["top", Math.abs(y - box.y)],
    ["bottom", Math.abs(box.y + box.height - y)],
  ];
  return distances.reduce(
    (nearest, entry) => (entry[1] < nearest[1] ? entry : nearest),
    distances[0]
  )[0];
}

/** The side of `box` that faces `toward`, and the middle of that side. */
export function facing(box: Box, toward: Box): RouteEnd {
  const dx = toward.x + toward.width / 2 - (box.x + box.width / 2);
  const dy = toward.y + toward.height / 2 - (box.y + box.height / 2);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0
      ? { x: box.x + box.width, y: centerY, side: "right" }
      : { x: box.x, y: centerY, side: "left" };
  return dy >= 0
    ? { x: centerX, y: box.y + box.height, side: "bottom" }
    : { x: centerX, y: box.y, side: "top" };
}
