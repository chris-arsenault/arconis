import { compareStacking, offsetPoints } from "./geometry";
import { isBox, isLink, type Item, type ItemType, type PathPoint } from "./types";
import { canvasObjectId, canvasObjectUrl } from "./ids";

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

/** Deleting an item also deletes its contents, line anchors and links touching any removed end. */
export function removalClosure(items: Item[], ids: Iterable<string>) {
  const removed = new Set(ids);
  let previousSize = -1;
  while (previousSize !== removed.size) {
    previousSize = removed.size;
    for (const item of items) if (removedWith(item, removed)) removed.add(item.id);
  }
  return removed;
}

function removedWith(item: Item, removed: Set<string>) {
  const related = [item.inside, item.onLine];
  if (isLink(item)) related.push(item.from, item.to);
  if (item.type === "highlight") related.push(item.target ?? "");
  return related.some((id) => removed.has(id));
}

/** Hidden items with everything that goes with them: contents, anchors and lines touching them. */
export function hiddenIds(items: Item[]) {
  const hidden = items.filter((item) => item.hidden).map((item) => item.id);
  return hidden.length ? removalClosure(items, hidden) : new Set<string>();
}

/** What one collapsed item folds away: what it holds, its branches, and lines into any of them. */
export function foldedBy(items: Item[], id: string) {
  const inner = [...containedDescendants(items, id), ...branchDescendants(items, id)];
  return inner.length ? removalClosure(items, inner) : new Set<string>();
}

/** Everything any collapsed item folds away. */
export function foldedIds(items: Item[]) {
  const folded = new Set<string>();
  for (const item of items)
    if (item.collapsed) foldedBy(items, item.id).forEach((id) => folded.add(id));
  return folded;
}

/** Items that are drawn: neither hidden nor folded away, with lines whose both ends are drawn. */
export function visibleItems(items: Item[]) {
  const hidden = hiddenIds(items);
  const folded = foldedIds(items);
  if (!hidden.size && !folded.size) return items;
  return items.filter((item) => !hidden.has(item.id) && !folded.has(item.id));
}

/**
 * What stays bright when focusing on an item: itself, what it holds, its tree beneath, whatever
 * those reference, and the lines among all of them.
 */
export function focusClosure(items: Item[], id: string) {
  const bright = new Set([id, ...containedDescendants(items, id), ...branchDescendants(items, id)]);
  const touches = (link: Item) => bright.has(link.from) || bright.has(link.to);
  for (const item of items.filter((link) => link.type === "reference" && touches(link))) {
    bright.add(item.from);
    bright.add(item.to);
  }
  const within = (link: Item) => bright.has(link.from) && bright.has(link.to);
  items.filter((item) => isLink(item) && within(item)).forEach((link) => bright.add(link.id));
  items.filter((item) => bright.has(item.onLine)).forEach((anchor) => bright.add(anchor.id));
  return bright;
}

/** Tiered numbers for the branches under every numbered topic: 1, 1.1, 1.2, 2, in the order they sit. */
export function branchNumbers(items: Item[]) {
  const numbers = new Map<string, string>();
  const visit = (id: string, prefix: string, seen: Set<string>) => {
    branchChildren(items, id).forEach((child, index) => {
      if (seen.has(child.id)) return;
      seen.add(child.id);
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      numbers.set(child.id, number);
      visit(child.id, number, seen);
    });
  };
  for (const item of items) if (item.numbered) visit(item.id, "", new Set([item.id]));
  return numbers;
}

/** Whether an item holds or heads others, so collapsing it would fold something away. */
export function holdsOthers(items: Item[], id: string) {
  return items.some(
    (item) => item.inside === id || (item.type === "branch" && item.from === id && item.to !== id)
  );
}

/** Every holder and topic above an item, through holders and branches, each once. */
function aboveTask(items: Item[], id: string) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const parents = new Map<string, string>();
  for (const item of [...items].sort(compareStacking))
    if (item.type === "branch" && !parents.has(item.to)) parents.set(item.to, item.from);
  const upward = (of: string) =>
    [byId.get(of)?.inside, parents.get(of)].filter(Boolean) as string[];
  const seen = new Set([id]);
  const pending = upward(id);
  while (pending.length) {
    const next = pending.pop()!;
    if (seen.has(next) || !byId.has(next)) continue;
    seen.add(next);
    pending.push(...upward(next));
  }
  seen.delete(id);
  return [...seen];
}

/** How many of the tasks each item holds or heads are done, and how many there are. */
export function taskCounts(items: Item[]) {
  const counts = new Map<string, { done: number; total: number }>();
  for (const task of items.filter((item) => item.task)) {
    for (const id of aboveTask(items, task.id)) {
      const count = counts.get(id) ?? { done: 0, total: 0 };
      count.total++;
      if (task.task === "done") count.done++;
      counts.set(id, count);
    }
  }
  return counts;
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
  const renameUrl = (url: string) => {
    const id = canvasObjectId(url);
    const copied = id && ids.get(id);
    return copied ? canvasObjectUrl(copied) : url;
  };
  return {
    ...item,
    id: rename(item.id),
    // Match whole URI tokens so a canvas URL inside an external URL remains external text.
    name: item.name.replace(/\b[a-z][a-z0-9+.-]*:[^\s<>()"'`[\]\\]+/gi, renameUrl),
    inside: rename(item.inside),
    from: rename(item.from),
    to: rename(item.to),
    onLine: rename(item.onLine),
    ...(item.target ? { target: rename(item.target) } : {}),
    ...(item.link ? { link: renameUrl(rename(item.link)) } : {}),
  };
}

/** Selection with descendants, anchors and internal links; empty IDs mean the whole canvas for files. */
export function selectedItems(all: Item[], ids: string[]) {
  if (!ids.length) return all;
  const chosen = new Set(ids);
  let size = -1;
  while (size !== chosen.size) {
    size = chosen.size;
    all
      .filter((item) => chosen.has(item.inside) || chosen.has(item.onLine))
      .forEach((item) => chosen.add(item.id));
  }
  return all.filter(
    (item) => chosen.has(item.id) || (isLink(item) && chosen.has(item.from) && chosen.has(item.to))
  );
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
