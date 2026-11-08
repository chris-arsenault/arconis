import type { PathPoint } from "./types";
import { pathDistance } from "./inkHit";
import { simplifyPath } from "./geometry";

/** Split a path along an eraser sweep. Sampling follows the eraser's width, not the zoom. */
export function cutInk(points: PathPoint[], sweep: PathPoint[], radius: number): PathPoint[][] {
  const pieces: PathPoint[][] = [];
  let piece: PathPoint[] = [];
  const keep = (point: PathPoint) => {
    if (pathDistance(point, sweep) > radius) piece.push(point);
    else if (piece.length) {
      pieces.push(piece);
      piece = [];
    }
  };
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1],
      [ex, ey] = points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(ex - x, ey - y) / (radius / 2)));
    for (let step = i === 1 ? 0 : 1; step <= count; step++)
      keep([x + ((ex - x) * step) / count, y + ((ey - y) * step) / count]);
  }
  if (piece.length) pieces.push(piece);
  return pieces.filter((part) => part.length > 1).map((part) => simplifyPath(part, radius / 10));
}
