import type { CanvasDocument } from "../document/canvasDocument";
import { branchChildren, branchParent } from "../document/relations";
import { LOCAL, type Item } from "../document/types";

/**
 * A tree as an outline: the rows a panel lists, in the order a person reads them, with their
 * depth and fold state, and the edits an outline makes to the tree it shows.
 */
export interface OutlineRow {
  item: Item;
  depth: number;
  heads: boolean;
}

/** The topic at the top of the tree an item belongs to. */
export function treeRootOf(items: Item[], id: string) {
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    const parent = branchParent(items, current);
    if (!parent || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

/** Every topic that heads a tree and has no parent of its own, in stacking order. */
export function treeRoots(items: Item[]) {
  return items.filter(
    (item) => !branchParent(items, item.id) && branchChildren(items, item.id).length > 0
  );
}

/** The rows under a root, folded trees showing only their head. */
export function outlineRows(items: Item[], rootId: string): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const seen = new Set<string>();
  const visit = (item: Item, depth: number) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const children = branchChildren(items, item.id);
    rows.push({ item, depth, heads: children.length > 0 });
    if (!item.collapsed) children.forEach((child) => visit(child, depth + 1));
  };
  const root = items.find((item) => item.id === rootId);
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
    document.patch(previous.id, { collapsed: undefined });
  }, LOCAL);
  document.undo.stopCapturing();
  return true;
}
