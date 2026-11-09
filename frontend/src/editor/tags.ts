import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item } from "../document/types";
import { parseTags } from "../language/fields";

/** Every tag in the room with how many items carry it, most used first, then by name. */
export function roomTags(items: Item[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The tags every one of the items carries, in the first item's order. */
export function sharedTags(items: Item[]) {
  const [first, ...rest] = items;
  return (first?.tags ?? []).filter((tag) => rest.every((item) => item.tags?.includes(tag)));
}

/** Tags typed as text: words separated by spaces or commas, with or without a leading #. */
export const typedTags = parseTags;

function changeTags(canvas: CanvasDocument, items: Item[], next: (tags: string[]) => string[]) {
  if (!items.length) return;
  canvas.undo.stopCapturing();
  canvas.doc.transact(() => {
    for (const item of items) {
      const tags = next(item.tags ?? []);
      canvas.patch(item.id, { tags: tags.length ? tags : undefined });
    }
  }, LOCAL);
  canvas.undo.stopCapturing();
}

/** Adds tags to every item that lacks them, as one undo step. */
export function addTags(canvas: CanvasDocument, items: Item[], tags: string[]) {
  if (tags.length) changeTags(canvas, items, (current) => [...new Set([...current, ...tags])]);
}

/** Removes a tag from every item, as one undo step. */
export function removeTag(canvas: CanvasDocument, items: Item[], tag: string) {
  changeTags(canvas, items, (current) => current.filter((existing) => existing !== tag));
}
