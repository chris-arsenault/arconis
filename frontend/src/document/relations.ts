import { compareStacking, offsetPoints } from "./geometry";
import { isBox, type Item, type ItemType, type PathPoint } from "./types";

/**
 * Topics are not a type of item. Any item can extend outward through branches and point at others
 * through references. Each link is its own record: concurrent additions never conflict, and
 * deleting an end removes the link.
 */
type Box = Pick<Item, "id" | "x" | "y" | "width" | "height">;
export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";
export type Offset = { dx: number; dy: number };

export function branchChildren(items: Item[], id: string) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => item.type === "branch" && item.from === id)
    .map((edge) => byId.get(edge.to))
    .filter((item) => item !== undefined)
    .sort((left, right) => left.y - right.y || compareStacking(left, right));
}

export function branchParent(items: Item[], id: string) {
  const incoming = items.filter((item) => item.type === "branch" && item.to === id);
  incoming.sort(compareStacking);
  return incoming[0]?.from ?? "";
}

/** Everything below a topic in its tree. Peers can create cycles, so each is visited once. */
export function branchDescendants(items: Item[], id: string) {
  const found = new Set([id]);
  const walk = (current: string) =>
    branchChildren(items, current).forEach((child) => {
      if (found.has(child.id)) return;
      found.add(child.id);
      walk(child.id);
    });
  walk(id);
  found.delete(id);
  return [...found];
}

/** Items held inside this one, at any depth, excluding itself. */
export function containedDescendants(items: Item[], id: string) {
  const found = new Set([id]);
  let previousSize = 0;
  while (previousSize !== found.size) {
    previousSize = found.size;
    items.filter((item) => found.has(item.inside)).forEach((item) => found.add(item.id));
  }
  found.delete(id);
  return [...found];
}

/** How many references touch each item, in one pass over the document. */
export function referenceCounts(items: Item[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.type !== "reference") continue;
    counts.set(item.from, (counts.get(item.from) ?? 0) + 1);
    counts.set(item.to, (counts.get(item.to) ?? 0) + 1);
  }
  return counts;
}

export function referencesOf(items: Item[], id: string) {
  return items
    .filter((item) => item.type === "reference" && (item.from === id || item.to === id))
    .map((edge) => ({
      id: edge.id,
      other: edge.from === id ? edge.to : edge.from,
      outgoing: edge.from === id,
    }));
}

const COPIED_TYPES = new Set<ItemType>(["node", "card", "note"]);

/**
 * Whether a new branch takes its parent's type, size and look. A line's anchor, an icon and a
 * container are not what the next topic should look like, so those branch into a plain rectangle.
 */
export function branchCopiesParent(parent: Item) {
  return (
    COPIED_TYPES.has(parent.type) &&
    parent.stencil !== "icon" &&
    parent.stencil !== "junction" &&
    !parent.onLine
  );
}

/** An item under new ids, with its references to other renamed items following them. */
export function renameItem(item: Item, ids: Map<string, string>): Item {
  const rename = (id: string) => ids.get(id) ?? id;
  return {
    ...item,
    id: rename(item.id),
    inside: rename(item.inside),
    from: rename(item.from),
    to: rename(item.to),
    onLine: rename(item.onLine),
  };
}

export function anchorOf(items: Item[], lineId: string) {
  return items.find((item) => item.onLine === lineId);
}

/** Removes items sitting on a line that no longer exists, with what they hold. */
export function orphanedAnchors(items: Item[]) {
  const present = new Set(items.map((item) => item.id));
  return items
    .filter((item) => item.onLine && !present.has(item.onLine))
    .flatMap((item) => [item.id, ...containedDescendants(items, item.id)]);
}

function pathBox(points: PathPoint[]) {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** World bounds of items, including ones too small to be drawn at the current zoom. */
export function worldBounds(items: Item[]) {
  const boxOf = (item: Item) => {
    if (isBox(item)) return item;
    return item.type === "drawing" ? pathBox(item.points) : null;
  };
  const boxes = items.map(boxOf).filter((box) => box !== null);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

/** Where to place a new branch: beyond its parent, under the children already there. */
export function branchPlacement(
  items: Item[],
  parent: Item,
  size: { width: number; height: number }
) {
  const children = branchChildren(items, parent.id);
  const grandparent = items.find((item) => item.id === branchParent(items, parent.id));
  const towardLeft = grandparent !== undefined && grandparent.x > parent.x;
  const gapX = Math.max(parent.width, size.width) * 0.4;
  const gapY = size.height * 0.25;
  const last = children[children.length - 1];
  return {
    towardLeft,
    x: towardLeft ? parent.x - gapX - size.width : parent.x + parent.width + gapX,
    y: last ? last.y + last.height + gapY : parent.y + parent.height / 2 - size.height / 2,
  };
}

/** Lays out a topic's tree around it, keeping each child on the side it is already on. */
export function tidyBranch(items: Item[], rootId: string) {
  const result = new Map<string, { x: number; y: number }>();
  const root = items.find((item) => item.id === rootId);
  if (!root) return result;
  const seen = new Set([rootId]);
  const childrenOf = (id: string) =>
    branchChildren(items, id).filter((child) => {
      if (seen.has(child.id)) return false;
      seen.add(child.id);
      return true;
    });
  const tree = new Map<string, Item[]>();
  const build = (id: string) => {
    const children = childrenOf(id);
    tree.set(id, children);
    children.forEach((child) => build(child.id));
  };
  build(rootId);
  const gapOf = (item: Item) => item.height * 0.25;
  const heightOf = (item: Item): number => {
    const children = tree.get(item.id) ?? [];
    const stack =
      children.reduce((total, child) => total + heightOf(child), 0) +
      (children.length - 1) * gapOf(item);
    return Math.max(item.height, stack);
  };
  const place = (parent: Item, children: Item[], left: boolean) => {
    const total =
      children.reduce((sum, child) => sum + heightOf(child), 0) +
      (children.length - 1) * gapOf(parent);
    const position = result.get(parent.id) ?? parent;
    let top = position.y + parent.height / 2 - total / 2;
    for (const child of children) {
      const height = heightOf(child);
      const gap = parent.width * 0.4;
      result.set(child.id, {
        x: left ? position.x - gap - child.width : position.x + parent.width + gap,
        y: top + height / 2 - child.height / 2,
      });
      place(child, tree.get(child.id) ?? [], left);
      top += height + gapOf(parent);
    }
  };
  const center = root.x + root.width / 2;
  const [leftSide, rightSide] = [true, false].map((left) =>
    (tree.get(rootId) ?? []).filter((child) => child.x + child.width / 2 < center === left)
  );
  place(root, leftSide, true);
  place(root, rightSide, false);
  return result;
}

export function alignOffsets(boxes: Box[], mode: AlignMode) {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const targets: Record<AlignMode, (box: Box) => Offset> = {
    left: (box) => ({ dx: left - box.x, dy: 0 }),
    right: (box) => ({ dx: right - box.x - box.width, dy: 0 }),
    center: (box) => ({ dx: (left + right - box.width) / 2 - box.x, dy: 0 }),
    top: (box) => ({ dx: 0, dy: top - box.y }),
    bottom: (box) => ({ dx: 0, dy: bottom - box.y - box.height }),
    middle: (box) => ({ dx: 0, dy: (top + bottom - box.height) / 2 - box.y }),
  };
  return new Map(boxes.map((box) => [box.id, targets[mode](box)]));
}

/** Evens the gaps between items, leaving the first and last where they are. */
export function distributeOffsets(boxes: Box[], axis: Axis) {
  const [start, size, other] =
    axis === "horizontal" ? (["x", "width", "dx"] as const) : (["y", "height", "dy"] as const);
  const sorted = [...boxes].sort((left, right) => left[start] - right[start]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[start] + last[size] - first[start];
  const used = sorted.reduce((total, box) => total + box[size], 0);
  const gap = (span - used) / Math.max(1, sorted.length - 1);
  const result = new Map<string, Offset>();
  let position = first[start];
  for (const box of sorted) {
    result.set(box.id, { dx: 0, dy: 0, [other]: position - box[start] });
    position += box[size] + gap;
  }
  return result;
}

/** New geometry for an item and what it holds, moved together in world coordinates. */
export function movedWithContents(items: Item[], id: string, dx: number, dy: number) {
  const ids = new Set([id, ...containedDescendants(items, id)]);
  return items
    .filter((item) => ids.has(item.id))
    .map((item) =>
      isBox(item)
        ? { id: item.id, values: { x: item.x + dx, y: item.y + dy } }
        : { id: item.id, values: { points: offsetPoints(item.points, dx, dy) } }
    );
}
