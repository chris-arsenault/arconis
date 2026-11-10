import type { CanvasDocument } from "../document/canvasDocument";
import { isLink, type Item } from "../document/types";
import { inkAction } from "./inkCommands";

/** Moving ink changes its destination without wrapping it in another object or changing paint. */
export function transferInk(
  document: CanvasDocument,
  selected: Item[],
  markup: boolean,
  layer: string
) {
  const items = selected.filter(
    (item) => ["drawing", "highlight"].includes(item.type) && !item.locked
  );
  const ids = new Set(items.map((item) => item.id));
  if (
    markup &&
    document.list().some((item) => isLink(item) && (ids.has(item.from) || ids.has(item.to)))
  )
    return false;
  inkAction(document, () => {
    for (const item of items)
      document.patch(item.id, { markup, inside: "", layer: markup ? "" : layer });
  });
  return true;
}
