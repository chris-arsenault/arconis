import { isBox, type InkKind, type Item, type Look, type PathPoint } from "./types";
import { authoredLook } from "./appearance";

export const INK_KINDS: InkKind[] = [
  "freehand",
  "line",
  "arrow",
  "double-arrow",
  "rectangle",
  "ellipse",
  "polygon",
  "bracket",
  "brace",
  "cloud",
];

/** Annotation membership is explicit; existing drawings stay workspace content. */
export const isMarkup = (item: Item) => item.markup ?? item.type === "highlight";

/** Annotations remain outside workspace containment. */
export function drawingIssue(item: Item) {
  if (isMarkup(item) && item.inside) return "Markup belongs directly on the canvas; use in none.";
  if (item.type === "highlight" && !item.target) return "A highlight needs target <object id>.";
  return null;
}

export function inkBounds(points: PathPoint[]) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [px, py] of points) {
    x = Math.min(x, px);
    y = Math.min(y, py);
    right = Math.max(right, px);
    bottom = Math.max(bottom, py);
  }
  return { x, y, width: right - x, height: bottom - y };
}

/** A highlight derives its outline from the target; stored target geometry is never copied. */
export function highlighted(
  item: Item,
  targets: Map<string, Item>,
  seen = new Set<string>(),
  named: Look = {}
): Item {
  const target = item.target ? targets.get(item.target) : undefined;
  if (item.type !== "highlight" || !target || !isBox(target)) return item;
  const key = `${target.id}:${outlinePlane(item)}`;
  const duplicate = seen.has(key);
  seen.add(key);
  const padding = 5 * (target.look.scale ?? 1);
  return {
    ...item,
    x: target.x - padding,
    y: target.y - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
    look: highlightLook(item, target, named, duplicate),
  };
}

function outlinePlane(item: Item) {
  return isMarkup(item) ? "markup" : item.layer || item.inside || "base";
}

function highlightLook(item: Item, target: Item, named: Look, duplicate: boolean): Look {
  return {
    ...item.look,
    scale: authoredLook(item, named).scale ?? target.look.scale ?? 1,
    rotation: target.look.rotation ?? 0,
    ...(duplicate ? { line: "none" } : {}),
  };
}

/** Geometry stays ordinary world-coordinate points, including generated annotation shapes. */
export function shapePoints(kind: InkKind, start: PathPoint, end: PathPoint): PathPoint[] {
  const [x, y] = start,
    [ex, ey] = end;
  const w = ex - x,
    h = ey - y;
  if (kind === "rectangle") return [start, [ex, y], end, [x, ey], start];
  if (kind === "ellipse" || kind === "cloud") {
    const count = kind === "cloud" ? 96 : 64;
    return Array.from({ length: count + 1 }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const bump = kind === "cloud" ? 1 + 0.08 * Math.sin(angle * 12) : 1;
      return [
        x + w / 2 + ((Math.cos(angle) * w) / 2) * bump,
        y + h / 2 + ((Math.sin(angle) * h) / 2) * bump,
      ];
    });
  }
  if (kind === "bracket") return [[ex, y], start, [x, ey], end];
  if (kind === "brace")
    return [
      [ex, y],
      [x + w / 2, y],
      [x + w / 2, y + h * 0.4],
      [x, y + h / 2],
      [x + w / 2, y + h * 0.6],
      [x + w / 2, ey],
      end,
    ];
  return [start, end];
}

export function isClosedInk(kind: InkKind) {
  return ["rectangle", "ellipse", "polygon", "cloud"].includes(kind);
}
