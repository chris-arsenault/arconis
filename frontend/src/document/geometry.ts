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
    if (parent?.kind === "group") origin = parent;
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
  return { ...item, ...position, points: worldPoints ?? fallback.points };
}

export function normalizeLegacyObjects(objects: CanvasObject[]) {
  const all = new Map(objects.map((item) => [item.id, item]));
  return objects.map((item) =>
    readWorldObject(item.id, (id) => (all.get(id) as StoredObject) || null)!
  );
}
