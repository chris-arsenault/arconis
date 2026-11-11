import type { CanvasDocument } from "./canvasDocument";
import { isId } from "./ids";
import { MARKERS, type Item, type Marker } from "./types";

/**
 * Shorthand typed into a label that becomes fields when the edit finishes: `#tag` adds a tag,
 * `[]` and `[x]` at the start make a task, `:star` or `:circle` set a marker. The words leave the
 * label, so what agents write explicitly and what people type quickly end up the same.
 */

const TAG = /(^|\s)#([A-Za-z_][A-Za-z0-9_-]*)(?=\s|$)/g;
const MARKER = new RegExp(String.raw`(^|\s):(${MARKERS.join("|")})(?=\s|$)`, "g");
const TASK = /^\[( ?|x|X)\]\s*/;

export interface Absorbed {
  name: string;
  fields: Partial<Item>;
}

/** Reads the shorthand out of a label, returning the label without it and the fields it set. */
export function absorbShorthand(name: string, current: Pick<Item, "tags">): Absorbed | null {
  const fields: Partial<Item> = {};
  let text = name;
  const tags = [...current.tags];
  text = text.replaceAll(TAG, (_match, space: string, tag: string) => {
    if (isId(tag) && !tags.includes(tag)) tags.push(tag);
    return space ? " " : "";
  });
  if (tags.length !== current.tags.length) fields.tags = tags;
  text = text.replaceAll(MARKER, (_match, space: string, marker: string) => {
    fields.marker = marker as Marker;
    return space ? " " : "";
  });
  const task = TASK.exec(text);
  if (task) {
    fields.task = task[1].toLowerCase() === "x" ? "done" : "open";
    text = text.slice(task[0].length);
  }
  if (!Object.keys(fields).length) return null;
  const cleaned = text
    .split("\n")
    .map((line) => line.replaceAll(/ {2,}/g, " ").trimEnd())
    .join("\n");
  return { name: cleaned, fields };
}

/** Applies a finished label's shorthand to its item, as part of the same edit. */
export function applyShorthand(document: CanvasDocument, id: string) {
  const item = document.get(id);
  if (!item) return false;
  const absorbed = absorbShorthand(item.name, item);
  if (!absorbed) return false;
  document.patch(id, { ...absorbed.fields, name: absorbed.name });
  return true;
}
