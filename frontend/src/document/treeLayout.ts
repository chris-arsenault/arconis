import { branchChildren, tidyBranch } from "./relations";
import type { Item } from "./types";

/**
 * Laying out a tree as a verb: to the right, to the left, down, or on both sides as its branches
 * already lie; spaced normally or compactly; in the order branches sit or sorted by name.
 */
export type TreeDirection = "sides" | "right" | "left" | "down";
export const TREE_DIRECTIONS: TreeDirection[] = ["sides", "right", "left", "down"];

export interface TreeLayoutOptions {
  direction: TreeDirection;
  compact: boolean;
  sorted: boolean;
}

type Place = { x: number; y: number };

/** Gaps as fractions of a parent's size: between levels, and between siblings. */
const LEVEL_GAP = { normal: 0.4, compact: 0.2 };
const SIBLING_GAP = { normal: 0.25, compact: 0.1 };

function compareNames(a: Item, b: Item) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/** The tree under a root as parent to children, each topic once, ordered as asked. */
function treeOf(items: Item[], rootId: string, sorted: boolean) {
  const tree = new Map<string, Item[]>();
  const seen = new Set([rootId]);
  const build = (id: string) => {
    const children = branchChildren(items, id).filter((child) => {
      if (seen.has(child.id)) return false;
      seen.add(child.id);
      return true;
    });
    if (sorted) children.sort(compareNames);
    tree.set(id, children);
    children.forEach((child) => build(child.id));
  };
  build(rootId);
  return tree;
}

/** Lays a tree out beside its root, children stacked vertically on the chosen side. */
function layoutBeside(
  root: Item,
  tree: Map<string, Item[]>,
  side: (child: Item) => boolean,
  factors: { level: number; sibling: number }
) {
  const result = new Map<string, Place>();
  const gapOf = (item: Item) => item.height * factors.sibling;
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
      const gap = parent.width * factors.level;
      result.set(child.id, {
        x: left ? position.x - gap - child.width : position.x + parent.width + gap,
        y: top + height / 2 - child.height / 2,
      });
      place(child, tree.get(child.id) ?? [], left);
      top += height + gapOf(parent);
    }
  };
  const children = tree.get(root.id) ?? [];
  place(
    root,
    children.filter((child) => side(child)),
    true
  );
  place(
    root,
    children.filter((child) => !side(child)),
    false
  );
  return result;
}

/** Lays a tree out beneath its root, children side by side under each parent. */
function layoutDown(
  root: Item,
  tree: Map<string, Item[]>,
  factors: { level: number; sibling: number }
) {
  const result = new Map<string, Place>();
  const gapOf = (item: Item) => item.width * factors.sibling;
  const widthOf = (item: Item): number => {
    const children = tree.get(item.id) ?? [];
    const row =
      children.reduce((total, child) => total + widthOf(child), 0) +
      (children.length - 1) * gapOf(item);
    return Math.max(item.width, row);
  };
  const place = (parent: Item) => {
    const children = tree.get(parent.id) ?? [];
    const total =
      children.reduce((sum, child) => sum + widthOf(child), 0) +
      (children.length - 1) * gapOf(parent);
    const position = result.get(parent.id) ?? parent;
    let left = position.x + parent.width / 2 - total / 2;
    for (const child of children) {
      const width = widthOf(child);
      result.set(child.id, {
        x: left + width / 2 - child.width / 2,
        y: position.y + parent.height + parent.height * factors.level * 1.5,
      });
      place(child);
      left += width + gapOf(parent);
    }
  };
  place(root);
  return result;
}

/**
 * What `tidy` moves: the whole tree laid out as asked, or with no options each branch tidied on
 * the side it already lies.
 */
export function tidyMoves(items: Item[], rootId: string, options: Partial<TreeLayoutOptions>) {
  const { direction, compact, sorted } = options;
  if (!direction && !compact && !sorted) return tidyBranch(items, rootId);
  return layoutTree(items, rootId, {
    direction: direction ?? "sides",
    compact: Boolean(compact),
    sorted: Boolean(sorted),
  });
}

/** New positions for every topic under a root, as the options ask; the root stays. */
export function layoutTree(items: Item[], rootId: string, options: TreeLayoutOptions) {
  const root = items.find((item) => item.id === rootId);
  if (!root) return new Map<string, Place>();
  const tree = treeOf(items, rootId, options.sorted);
  const factors = {
    level: options.compact ? LEVEL_GAP.compact : LEVEL_GAP.normal,
    sibling: options.compact ? SIBLING_GAP.compact : SIBLING_GAP.normal,
  };
  if (options.direction === "down") return layoutDown(root, tree, factors);
  const centre = root.x + root.width / 2;
  const sides: Record<Exclude<TreeDirection, "down">, (child: Item) => boolean> = {
    sides: (child) => child.x + child.width / 2 < centre,
    left: () => true,
    right: () => false,
  };
  return layoutBeside(root, tree, sides[options.direction], factors);
}

/** Sides for a root's branches that alternate, so a lopsided map becomes balanced. */
export function balancedSides(items: Item[], rootId: string) {
  const root = items.find((item) => item.id === rootId);
  if (!root) return new Map<string, Place>();
  const children = branchChildren(items, rootId);
  const moves = new Map<string, Place>();
  children.forEach((child, index) => {
    const left = index % 2 === 1;
    const x = left
      ? root.x - root.width * LEVEL_GAP.normal - child.width
      : root.x + root.width + root.width * LEVEL_GAP.normal;
    moves.set(child.id, { x, y: child.y });
  });
  return moves;
}
