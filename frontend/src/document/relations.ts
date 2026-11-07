import { compareStacking, isVertexKind, offsetPoints } from "./geometry";
import type { CanvasObject, ObjectKind, StyleValue } from "./types";

/**
 * Topics are not a kind of object. Any object can extend outward through branches and point at
 * others through references, and both are connectors marked in their style. Each link is therefore
 * its own record: concurrent additions never conflict, and deleting an end removes the link.
 */
export const RELATION_BRANCH = "branch";
export const RELATION_REFERENCE = "reference";
/** Style key naming the line a small object sits on, which lets a line act as a topic. */
export const LINE_ANCHOR = "lineAnchor";

type Box = Pick<CanvasObject, "id" | "x" | "y" | "width" | "height">;
export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";
export type Offset = { dx: number; dy: number };

const isRelation = (item: CanvasObject, relation: string) =>
  item.kind === "connector" && item.style.relation === relation;

export function branchChildren(items: CanvasObject[], id: string) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => isRelation(item, RELATION_BRANCH) && item.source === id)
    .map((edge) => byId.get(edge.target))
    .filter((item) => item !== undefined)
    .sort((left, right) => left.y - right.y || compareStacking(left, right));
}

export function branchParent(items: CanvasObject[], id: string) {
  const incoming = items.filter((item) => isRelation(item, RELATION_BRANCH) && item.target === id);
  incoming.sort(compareStacking);
  return incoming[0]?.source ?? "";
}

/** Everything below a topic in its tree. Peers can create cycles, so each is visited once. */
export function branchDescendants(items: CanvasObject[], id: string) {
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

/** Objects held inside this one, at any depth, excluding itself. */
export function containedDescendants(items: CanvasObject[], id: string) {
  const found = new Set([id]);
  let previousSize = 0;
  while (previousSize !== found.size) {
    previousSize = found.size;
    items.filter((item) => found.has(item.parent)).forEach((item) => found.add(item.id));
  }
  found.delete(id);
  return [...found];
}

/** How many references touch each object, in one pass over the document. */
export function referenceCounts(items: CanvasObject[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!isRelation(item, RELATION_REFERENCE)) continue;
    counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    counts.set(item.target, (counts.get(item.target) ?? 0) + 1);
  }
  return counts;
}

export function referencesOf(items: CanvasObject[], id: string) {
  return items
    .filter(
      (item) => isRelation(item, RELATION_REFERENCE) && (item.source === id || item.target === id)
    )
    .map((edge) => ({
      id: edge.id,
      other: edge.source === id ? edge.target : edge.source,
      outgoing: edge.source === id,
    }));
}

const COPIED_KINDS = new Set<ObjectKind>([
  "rectangle",
  "ellipse",
  "diamond",
  "service",
  "database",
  "cloud",
  "person",
  "sticky",
]);

/**
 * Whether a new branch takes its parent's kind, size and style. A line's anchor and a container are
 * not what the next topic should look like, so those branch into a plain rectangle.
 */
export function branchCopiesParent(parent: CanvasObject) {
  return COPIED_KINDS.has(parent.kind) && !(LINE_ANCHOR in parent.style);
}

export function anchorOf(items: CanvasObject[], lineId: string) {
  return items.find((item) => item.style[LINE_ANCHOR] === lineId);
}

/** A copy of a style with its reference to another object rewritten for new identifiers. */
export function remapStyle(style: Record<string, StyleValue>, ids: Map<string, string>) {
  const line = style[LINE_ANCHOR];
  if (typeof line !== "string") return style;
  return { ...style, [LINE_ANCHOR]: ids.get(line) ?? "" };
}

/** Removes objects sitting on a line that no longer exists, with what they hold. */
export function orphanedAnchors(items: CanvasObject[]) {
  const present = new Set(items.map((item) => item.id));
  return items
    .filter((item) => {
      const line = item.style[LINE_ANCHOR];
      return typeof line === "string" && !present.has(line);
    })
    .flatMap((item) => [item.id, ...containedDescendants(items, item.id)]);
}

function pathBox(item: CanvasObject) {
  const points = JSON.parse(item.points) as [number, number][];
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** World bounds of objects, including ones too small to be drawn at the current zoom. */
export function worldBounds(items: CanvasObject[]) {
  const boxOf = (item: CanvasObject) => {
    if (isVertexKind(item.kind)) return item;
    return item.kind === "stroke" ? pathBox(item) : null;
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
  items: CanvasObject[],
  parent: CanvasObject,
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
export function tidyBranch(items: CanvasObject[], rootId: string) {
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
  const tree = new Map<string, CanvasObject[]>();
  const build = (id: string) => {
    const children = childrenOf(id);
    tree.set(id, children);
    children.forEach((child) => build(child.id));
  };
  build(rootId);
  const gapOf = (item: CanvasObject) => item.height * 0.25;
  const heightOf = (item: CanvasObject): number => {
    const children = tree.get(item.id) ?? [];
    const stack =
      children.reduce((total, child) => total + heightOf(child), 0) +
      (children.length - 1) * gapOf(item);
    return Math.max(item.height, stack);
  };
  const place = (parent: CanvasObject, children: CanvasObject[], left: boolean) => {
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

/** Evens the gaps between objects, leaving the first and last where they are. */
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

/** New geometry for an object and what it holds, moved together in world coordinates. */
export function movedWithContents(items: CanvasObject[], id: string, dx: number, dy: number) {
  const ids = new Set([id, ...containedDescendants(items, id)]);
  return items
    .filter((item) => ids.has(item.id))
    .map((item) =>
      isVertexKind(item.kind)
        ? { id: item.id, values: { x: item.x + dx, y: item.y + dy } }
        : { id: item.id, values: { points: offsetPoints(item.points, dx, dy) } }
    );
}
