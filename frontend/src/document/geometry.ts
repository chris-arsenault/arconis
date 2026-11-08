import type { Item, Look, PathPoint } from "./types";

export const ICON_VENDORS = ["aws", "azure", "gcp"] as const;
export type IconVendor = (typeof ICON_VENDORS)[number];

export function vendorOfIcon(key: unknown): IconVendor | null {
  if (typeof key !== "string") return null;
  return ICON_VENDORS.find((vendor) => key.startsWith(`${vendor}:`)) ?? null;
}

/** Vendor terms ask that their icons stay undistorted and unrotated, so these only scale evenly. */
export function isLockedIcon(item: Pick<Item, "icon">) {
  return vendorOfIcon(item.icon) !== null;
}

export function offsetPoints(points: PathPoint[], x: number, y: number): PathPoint[] {
  if (!x && !y) return points;
  return points.map(([px, py]) => [px + x, py + y]);
}

/** Tests the displayed box by undoing its semantic rotation around the center. */
export function pointInBox(item: Item, [x, y]: PathPoint, look: Look = item.look) {
  const angle = isLockedIcon(item) ? 0 : -((look.rotation ?? 0) * Math.PI) / 180;
  const dx = x - item.x - item.width / 2,
    dy = y - item.y - item.height / 2;
  return (
    Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= item.width / 2 &&
    Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= item.height / 2
  );
}

export function compareStacking(left: Item, right: Item) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

/** Removes redundant pointer samples while keeping a freehand path within `tolerance`. */
export function simplifyPath(points: PathPoint[], tolerance: number) {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index++) {
      const current = lineDistance(points[index], points[first], points[last]);
      if (current > distance) {
        distance = current;
        farthest = index;
      }
    }
    if (farthest < 0) continue;
    keep.add(farthest);
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, index) => keep.has(index));
}

function lineDistance([x, y]: PathPoint, [x1, y1]: PathPoint, [x2, y2]: PathPoint) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  if (!length) return Math.hypot(x - x1, y - y1);
  const position = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + position * dx), y - (y1 + position * dy));
}
