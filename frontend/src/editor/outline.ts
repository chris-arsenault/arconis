import type { CanvasDocument } from "../document/canvasDocument";
import { branchChildren, branchParent } from "../document/relations";
import { LOCAL, type Item } from "../document/types";
import { compareStacking } from "../document/geometry";

/**
 * A tree as an outline: the rows a panel lists, in the order a person reads them, with their
 * depth and fold state, and the edits an outline makes to the tree it shows.
 */
export interface OutlineRow {
  item: Item;
  depth: number;
  heads: boolean;
}

/** Build the relationships once per outline query, including the first incoming branch in
 * stacking order, rather than rebuilding an item map for every candidate root or row. */
function outlineTree(items: Item[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, Item[]>();
  const incoming = new Map<string, Item>();
  for (const branch of items.filter((item) => item.type === "branch")) {
    const previous = incoming.get(branch.to);
    if (!previous || compareStacking(branch, previous) < 0) incoming.set(branch.to, branch);
    const child = byId.get(branch.to);
    if (!child) continue;
    const group = children.get(branch.from) ?? [];
    group.push(child);
    children.set(branch.from, group);
  }
  children.forEach((group) => {
    group.sort((a, b) => a.y - b.y || compareStacking(a, b));
  });
  return { byId, children, incoming };
}

/** The topic at the top of the tree an item belongs to. */
export function treeRootOf(items: Item[], id: string) {
  const { incoming } = outlineTree(items);
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    const parent = incoming.get(current)?.from;
    if (!parent || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

/** Every topic that heads a tree and has no parent of its own, in stacking order. */
export function treeRoots(items: Item[]) {
  const { children, incoming } = outlineTree(items);
  return items.filter((item) => !incoming.get(item.id)?.from && children.has(item.id));
}

/** The rows under a root, folded trees showing only their head. */
export function outlineRows(items: Item[], rootId: string): OutlineRow[] {
  const tree = outlineTree(items);
  const rows: OutlineRow[] = [];
  const seen = new Set<string>();
  const visit = (item: Item, depth: number) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const children = tree.children.get(item.id) ?? [];
    rows.push({ item, depth, heads: children.length > 0 });
    if (!item.collapsed) children.forEach((child) => visit(child, depth + 1));
  };
  const root = tree.byId.get(rootId);
  if (root) visit(root, 0);
  return rows;
}

/** Makes a topic a branch of the sibling just before it, as Tab does in an outline. */
export function indentUnderPrevious(document: CanvasDocument, id: string) {
  const items = document.list();
  const parent = branchParent(items, id);
  if (!parent) return false;
  const siblings = branchChildren(items, parent);
  const index = siblings.findIndex((sibling) => sibling.id === id);
  const previous = siblings[index - 1];
  const branch = items.find((item) => item.type === "branch" && item.to === id);
  if (!previous || !branch) return false;
  document.undo.stopCapturing();
  document.doc.transact(() => {
    document.patch(branch.id, { from: previous.id });
    document.patch(previous.id, { collapsed: false });
  }, LOCAL);
  document.undo.stopCapturing();
  return true;
}
