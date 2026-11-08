import { selectedItems } from "./relations";
import { isMarkup } from "./ink";
import type { Item } from "./types";

/** Portable selections keep attached highlights and their targets together; geometry selections do not. */
export function exportItems(items: Item[], ids: string[], includeMarkup = true) {
  if (!ids.length) return items.filter((item) => includeMarkup || !isMarkup(item));
  const selected = new Set(selectedItems(items, ids).map((item) => item.id));
  for (const item of items.filter((item) => item.type === "highlight")) {
    if (item.target && selected.has(item.target)) selected.add(item.id);
    if (selected.has(item.id) && item.target) selected.add(item.target);
  }
  if (!selected.size) return [];
  return selectedItems(items, [...selected]).filter((item) => includeMarkup || !isMarkup(item));
}
