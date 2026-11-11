import { branchChildren, branchParent } from "../document/relations";
import { isBox, type Item } from "../document/types";

/**
 * Where an arrow key takes the selection: through a tree by structure, from parent to child to
 * sibling, and across loose objects by direction, to the nearest one that way.
 */

export type Direction = "left" | "right" | "up" | "down";

type Point = { x: number; y: number };

function centre(item: Item): Point {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/** Whether `to` lies in the quarter of the plane that `direction` names from `from`. */
function towards(from: Point, to: Point, direction: Direction) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  switch (direction) {
    case "left":
      return dx < 0 && Math.abs(dx) >= Math.abs(dy);
    case "right":
      return dx > 0 && Math.abs(dx) >= Math.abs(dy);
    case "up":
      return dy < 0 && Math.abs(dy) > Math.abs(dx);
    default:
      return dy > 0 && Math.abs(dy) > Math.abs(dx);
  }
}

function nearest(from: Item, candidates: Item[], direction: Direction) {
  const origin = centre(from);
  let best: Item | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const target = centre(candidate);
    if (!towards(origin, target, direction)) continue;
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Objects the selection can walk to: drawn boxes, leaving out line anchors. */
function walkable(items: Item[]) {
  return items.filter((item) => isBox(item) && !item.onLine);
}

/** The topic's parent, children and siblings, which an arrow prefers over loose neighbours. */
function relatives(items: Item[], item: Item) {
  const byId = new Map(items.map((candidate) => [candidate.id, candidate]));
  const parentId = branchParent(items, item.id);
  const parent = parentId ? byId.get(parentId) : undefined;
  const siblings = parent ? branchChildren(items, parent.id) : [];
  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  return {
    parent,
    children: branchChildren(items, item.id),
    previous: index > 0 ? siblings[index - 1] : undefined,
    next: index >= 0 ? siblings[index + 1] : undefined,
  };
}

/** Up and down walk siblings; left and right walk between a parent and its children. */
function structural(items: Item[], item: Item, direction: Direction) {
  const { parent, children, previous, next } = relatives(items, item);
  if (direction === "up") return previous ?? null;
  if (direction === "down") return next ?? null;
  const origin = centre(item);
  const thatWay = (candidate: Item | undefined) =>
    candidate && towards(origin, centre(candidate), direction) ? candidate : null;
  const child = nearest(item, children, direction);
  return thatWay(parent) ?? child ?? null;
}

/** The object an arrow moves the selection to, or null when nothing lies that way. */
export function neighbour(items: Item[], item: Item, direction: Direction): Item | null {
  const inTree = relatives(items, item);
  if (inTree.parent || inTree.children.length) {
    const related = structural(items, item, direction);
    if (related) return related;
  }
  return nearest(
    item,
    walkable(items).filter((candidate) => candidate.id !== item.id),
    direction
  );
}
