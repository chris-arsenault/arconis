import type { CanvasDocument } from "../document/canvasDocument";
import {
  branchChildren,
  branchDescendants,
  branchParent,
  containedDescendants,
  movedWithContents,
  worldBounds,
} from "../document/relations";
import { LOCAL, isBox, type Item } from "../document/types";
import type { Direction } from "./walking";

/**
 * Edits to a tree's structure from the keyboard: promoting, reordering, inserting a parent,
 * deleting a topic without its branches and growing a connected copy. Each is one undo step.
 */

/** Room left between a topic and a parent put in front of it, or a clone beside it. */
const GAP = 40;

function step(document: CanvasDocument, work: () => void) {
  document.undo.stopCapturing();
  document.doc.transact(work, LOCAL);
  document.undo.stopCapturing();
}

function branchTo(items: Item[], id: string) {
  return items.find((item) => item.type === "branch" && item.to === id);
}

/** Everything that moves with a topic: what it holds and its whole tree beneath. */
function subtree(items: Item[], id: string) {
  return [id, ...branchDescendants(items, id), ...containedDescendants(items, id)];
}

function moveSubtree(document: CanvasDocument, items: Item[], id: string, dx: number, dy: number) {
  const moved = new Set<string>();
  for (const member of [id, ...branchDescendants(items, id)])
    for (const change of movedWithContents(items, member, dx, dy)) {
      if (moved.has(change.id)) continue;
      moved.add(change.id);
      document.patch(change.id, change.values);
    }
}

/** Moves a topic up to its grandparent, keeping its place on the canvas. */
export function promote(document: CanvasDocument, id: string) {
  const items = document.list();
  const parent = branchParent(items, id);
  const grandparent = parent ? branchParent(items, parent) : "";
  const branch = branchTo(items, id);
  if (!grandparent || !branch) return false;
  step(document, () => document.patch(branch.id, { from: grandparent }));
  return true;
}

/** Puts a new topic between a topic and its parent, and returns the new topic's id. */
export function insertParent(document: CanvasDocument, id: string) {
  const items = document.list();
  const item = items.find((candidate) => candidate.id === id);
  if (!item || !isBox(item)) return "";
  const branch = branchTo(items, id);
  const parent = branchParent(items, id);
  const towardLeft = parent
    ? (items.find((candidate) => candidate.id === parent)?.x ?? 0) > item.x
    : false;
  const inserted = document.build(item.type, item.x, item.y, {
    width: item.width,
    height: item.height,
    stencil: item.stencil,
    style: item.style,
    look: { ...item.look },
    inside: item.inside,
  });
  step(document, () => {
    const shift = (item.width + GAP) * (towardLeft ? -1 : 1);
    moveSubtree(document, items, id, shift, 0);
    document.insert(inserted);
    if (branch) document.patch(branch.id, { to: inserted.id });
    document.insert(
      document.build("branch", 0, 0, {
        from: inserted.id,
        to: id,
        fromPort: [towardLeft ? 0 : 1, 0.5],
        toPort: [towardLeft ? 1 : 0, 0.5],
      })
    );
  });
  return inserted.id;
}

/** Removes a topic, handing its branches to its parent and its contents to its holder. */
export function deleteKeepingChildren(document: CanvasDocument, id: string) {
  const items = document.list();
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return false;
  const parent = branchParent(items, id);
  step(document, () => {
    for (const branch of items.filter((link) => link.type === "branch" && link.from === id)) {
      if (parent) document.patch(branch.id, { from: parent });
      else document.items.delete(branch.id);
    }
    for (const held of items.filter((candidate) => candidate.inside === id))
      document.patch(held.id, { inside: item.inside });
    document.remove([id]);
  });
  return true;
}

/** Bounds of a topic with its tree, for swapping whole subtrees. */
function treeBounds(items: Item[], id: string) {
  const ids = new Set(subtree(items, id));
  return worldBounds(items.filter((item) => ids.has(item.id)));
}

/**
 * Swaps a topic's subtree with the sibling before or after it, so Alt with an arrow reorders a
 * tree; a member of an arranged frame swaps places with its neighbour the same way.
 */
export function reorderSibling(document: CanvasDocument, id: string, by: -1 | 1) {
  const items = document.list();
  const item = items.find((candidate) => candidate.id === id);
  if (!item || !isBox(item)) return false;
  const parent = branchParent(items, id);
  const siblings = parent
    ? branchChildren(items, parent)
    : items
        .filter(
          (candidate) => candidate.inside === item.inside && isBox(candidate) && !candidate.onLine
        )
        .sort((a, b) => a.y - b.y || a.x - b.x);
  const index = siblings.findIndex((sibling) => sibling.id === id);
  const other = siblings[index + by];
  if (!other) return false;
  const mine = treeBounds(items, id);
  const theirs = treeBounds(items, other.id);
  if (!mine || !theirs) return false;
  const first = by > 0 ? mine : theirs;
  const second = by > 0 ? theirs : mine;
  const gap = second.y - (first.y + first.height);
  step(document, () => {
    moveSubtree(document, items, by > 0 ? id : other.id, 0, second.height + gap);
    moveSubtree(document, items, by > 0 ? other.id : id, 0, -(first.height + gap));
  });
  return true;
}

/** A copy of an object placed one gap away, joined to it; a topic's copy is its branch. */
export function connectedClone(
  document: CanvasDocument,
  id: string,
  direction: Direction,
  placement: Partial<Pick<Item, "x" | "y" | "width" | "height" | "look">> = {}
) {
  const items = document.list();
  const item = items.find((candidate) => candidate.id === id);
  if (!item || !isBox(item)) return "";
  const offsets: Record<Direction, [number, number]> = {
    left: [-(item.width + GAP), 0],
    right: [item.width + GAP, 0],
    up: [0, -(item.height + GAP)],
    down: [0, item.height + GAP],
  };
  const [dx, dy] = offsets[direction];
  const clone = document.build(item.type, item.x + dx, item.y + dy, {
    width: item.width,
    height: item.height,
    stencil: item.stencil,
    style: item.style,
    look: { ...item.look },
    inside: item.inside,
    icon: item.icon,
    ...placement,
  });
  const inTree = branchParent(items, id) || branchChildren(items, id).length > 0;
  const link = document.build(inTree ? "branch" : "line", 0, 0, { from: id, to: clone.id });
  if (inTree) {
    link.fromPort = [direction === "left" ? 0 : 1, 0.5];
    link.toPort = [direction === "left" ? 1 : 0, 0.5];
  }
  step(document, () => {
    document.insert(clone);
    document.insert(link);
  });
  return clone.id;
}

/** Collapses the topics deeper than `levels` under a root and expands the rest, as one step. */
export function showLevels(document: CanvasDocument, rootId: string, levels: number) {
  const items = document.list();
  const depths = new Map<string, number>([[rootId, 0]]);
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    const depth = depths.get(id)!;
    for (const child of branchChildren(items, id)) {
      if (depths.has(child.id)) continue;
      depths.set(child.id, depth + 1);
      pending.push(child.id);
    }
  }
  step(document, () => {
    for (const [id, depth] of depths) {
      const heads = branchChildren(items, id).length > 0;
      document.patch(id, { collapsed: heads && depth >= levels });
    }
  });
}
