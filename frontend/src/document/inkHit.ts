import type { PathPoint } from "./types";

export function inPolygon([x, y]: PathPoint, polygon: PathPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pathDistance(point: PathPoint, points: PathPoint[]) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1],
      [ex, ey] = points[i];
    const dx = ex - x,
      dy = ey - y;
    const t = Math.max(
      0,
      Math.min(1, ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy || 1))
    );
    best = Math.min(best, Math.hypot(point[0] - x - t * dx, point[1] - y - t * dy));
  }
  return best;
}

/** Segment crossings count even when neither path has a sampled point at the crossing. */
export function pathsTouch(first: PathPoint[], second: PathPoint[], radius: number) {
  for (let i = 1; i < first.length; i++)
    for (let j = 1; j < second.length; j++) {
      const a = first[i - 1],
        b = first[i],
        c = second[j - 1],
        d = second[j];
      if (segmentsCross(a, b, c, d)) return true;
      if (
        Math.min(
          pathDistance(a, [c, d]),
          pathDistance(b, [c, d]),
          pathDistance(c, [a, b]),
          pathDistance(d, [a, b])
        ) <= radius
      )
        return true;
    }
  return false;
}

function segmentsCross(a: PathPoint, b: PathPoint, c: PathPoint, d: PathPoint) {
  const cross = (p: PathPoint, q: PathPoint, r: PathPoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const x = cross(a, b, c) * cross(a, b, d),
    y = cross(c, d, a) * cross(c, d, b);
  if (x > 0 || y > 0) return false;
  return (
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
  );
}
