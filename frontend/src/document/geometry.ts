import type { CanvasObject, ObjectKind, Optional } from "./types";

export interface WorldGeometry {
  x: number;
  y: number;
  points: string;
}
export interface StoredObject extends CanvasObject {
  worldX: Optional<number>;
  worldY: Optional<number>;
  worldPoints: Optional<string>;
  legacyWorld: Optional<WorldGeometry>;
}

export const ICON_VENDORS = ["aws", "azure", "gcp"] as const;
export type IconVendor = (typeof ICON_VENDORS)[number];

export function vendorOfIcon(key: unknown): IconVendor | null {
  if (typeof key !== "string") return null;
  return ICON_VENDORS.find((vendor) => key.startsWith(`${vendor}:`)) ?? null;
}

/** Vendor terms ask that their icons stay undistorted and unrotated, so these only scale evenly. */
export function isLockedIcon(style: Record<string, unknown>) {
  return vendorOfIcon(style.icon) !== null;
}

/** Kinds that exist to hold others. Any object can hold children, but these have frame behavior. */
export function isContainerKind(kind: ObjectKind | undefined) {
  return kind === "group" || kind === "panel";
}

export function isVertexKind(kind: ObjectKind) {
  return kind !== "connector" && kind !== "stroke";
}

export function offsetPoints(points: string, x: number, y: number) {
  if (!x && !y) return points;
  return JSON.stringify(
    (JSON.parse(points) as [number, number][]).map(([px, py]) => [px + x, py + y])
  );
}

export function readWorldObject(
  id: string,
  lookup: (id: string) => StoredObject | null,
  visited = new Set<string>()
): CanvasObject | null {
  const stored = lookup(id);
  if (!stored) return null;
  visited.add(id);
  let origin = { x: 0, y: 0 };
  if (stored.parent && !visited.has(stored.parent)) {
    const parent = readWorldObject(stored.parent, lookup, visited);
    if (parent && isVertexKind(parent.kind)) origin = parent;
  }
  return normalize(stored, origin);
}

function normalize(stored: StoredObject, origin: { x: number; y: number }): CanvasObject {
  const { worldX, worldY, worldPoints, legacyWorld, ...item } = stored;
  const vertex = isVertexKind(item.kind);
  const fallback = legacyWorld || {
    x: item.x + origin.x,
    y: item.y + origin.y,
    points: vertex ? item.points : offsetPoints(item.points, origin.x, origin.y),
  };
  const position = vertex
    ? { x: worldX ?? fallback.x, y: worldY ?? fallback.y }
    : { x: item.x, y: item.y };
  return { ...item, ...position, points: worldPoints ?? fallback.points, order: item.order ?? 0 };
}

export function compareStacking(left: CanvasObject, right: CanvasObject) {
  return left.order - right.order || left.id.localeCompare(right.id);
}

/** Removes redundant pointer samples while keeping a freehand path within `tolerance`. */
export function simplifyPath(points: [number, number][], tolerance: number) {
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

function lineDistance(
  [x, y]: [number, number],
  [x1, y1]: [number, number],
  [x2, y2]: [number, number]
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  if (!length) return Math.hypot(x - x1, y - y1);
  const position = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length));
  return Math.hypot(x - (x1 + position * dx), y - (y1 + position * dy));
}

export function normalizeLegacyObjects(objects: CanvasObject[]) {
  const all = new Map(objects.map((item) => [item.id, item]));
  return objects.map((item) =>
    readWorldObject(item.id, (id) => (all.get(id) as StoredObject) || null)!
  );
}
