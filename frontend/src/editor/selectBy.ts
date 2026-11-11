import { compareStacking, pointInBox } from "../document/geometry";
import { branchParent } from "../document/relations";
import { isBox, isLink, type Item } from "../document/types";
import type { EditorController } from "./controller";

/**
 * Selections by what items have in common, so restyling and aligning have something
 * to work on. Each takes the current selection and the canvas and returns the ids to select.
 */

export type SelectBy = "type" | "style" | "children" | "siblings" | "connected";

function kind(item: Item) {
  return item.type === "node" ? `node ${item.stencil}` : item.type;
}

function drawn(items: Item[]) {
  return items.filter((item) => !item.locked);
}

/** Items of the same kinds as the selection: nodes by stencil, everything else by type. */
export function sameType(items: Item[], selected: Item[]) {
  const kinds = new Set(selected.map(kind));
  return drawn(items)
    .filter((item) => kinds.has(kind(item)))
    .map((item) => item.id);
}

/** Items with one of the selection's named styles, or with no style when the selection has none. */
export function sameStyle(items: Item[], selected: Item[]) {
  const styles = new Set(selected.map((item) => item.style));
  return drawn(items)
    .filter((item) => styles.has(item.style))
    .map((item) => item.id);
}

/** What the selection holds directly, and its direct branches. */
export function children(items: Item[], selected: Item[]) {
  const ids = new Set(selected.map((item) => item.id));
  const branched = new Set(
    items.filter((item) => item.type === "branch" && ids.has(item.from)).map((item) => item.to)
  );
  return drawn(items)
    .filter((item) => ids.has(item.inside) || branched.has(item.id))
    .map((item) => item.id);
}

/** Items branching from the same topic as the selection, or, where no topic heads them, held by the same holder. */
export function siblings(items: Item[], selected: Item[]) {
  const family = (item: Item) => {
    const parent = branchParent(items, item.id);
    return parent ? `branch ${parent}` : `holder ${item.inside}`;
  };
  const families = new Set(selected.filter((item) => !isLink(item)).map(family));
  return drawn(items)
    .filter((item) => !isLink(item) && families.has(family(item)))
    .map((item) => item.id);
}

/** The selection with the lines touching it and the items at those lines' other ends. */
export function connected(items: Item[], selected: Item[]) {
  const ids = new Set(selected.map((item) => item.id));
  const links = items.filter((item) => isLink(item) && (ids.has(item.from) || ids.has(item.to)));
  const found = new Set([...ids, ...links.flatMap((link) => [link.id, link.from, link.to])]);
  return drawn(items)
    .filter((item) => found.has(item.id))
    .map((item) => item.id);
}

/** Every object drawn at the top level that is not selected; lines follow their ends. */
export function inverted(items: Item[], selected: Item[]) {
  const ids = new Set(selected.map((item) => item.id));
  return drawn(items)
    .filter((item) => !isLink(item) && !ids.has(item.id) && !item.inside && !item.onLine)
    .map((item) => item.id);
}

export const SELECT_BY: Record<SelectBy, (items: Item[], selected: Item[]) => string[]> = {
  type: sameType,
  style: sameStyle,
  children,
  siblings,
  connected,
};

/** Selects items by id, keeping only those the graph draws. */
export function selectIds(editor: EditorController, ids: string[]) {
  const model = editor.graph.getDataModel();
  editor.graph.setSelectionCells(
    ids.map((id) => model.getCell(id)).filter((cell) => cell !== null)
  );
  editor.emit();
}

/**
 * The boxes under a world point, topmost first, so a click with Alt can step down through items
 * stacked on one another.
 */
export function stackAt(items: Item[], point: { x: number; y: number }) {
  return items
    .filter((item) => isBox(item) && pointInBox(item, [point.x, point.y]))
    .sort(compareStacking)
    .reverse();
}

/** The item below the selected one in a stack under the pointer, wrapping to the top. */
export function nextInStack(items: Item[], selected: Item[], point: { x: number; y: number }) {
  const stack = stackAt(items, point);
  if (!stack.length) return null;
  const index = stack.findIndex((item) => selected.some((chosen) => chosen.id === item.id));
  return stack[(index + 1) % stack.length];
}
