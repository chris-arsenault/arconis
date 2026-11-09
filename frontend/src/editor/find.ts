import type { CanvasComment } from "../document/comments";
import { hiddenIds, removalClosure, worldBounds } from "../document/relations";
import { isBox, typeLabel, type Item } from "../document/types";
import type { EditorController } from "./controller";
import { fittingView, flyToView } from "./views";
import { changeFields } from "./commands";

/** How much of the window a found object fills, enough to see what is around it. */
const FIND_FILL = 0.3;

export interface Match {
  item: Item;
  /** Where the words were found: the name, subtitle, a tag, a comment or the id. */
  where: "name" | "subtitle" | "tag" | "comment" | "id";
  hidden: boolean;
}

/** What find looks through on an item: its own words, and the comments on it. */
function texts(item: Item, comments: CanvasComment[]): [Match["where"], string][] {
  return [
    ["name", item.name],
    ["subtitle", item.subtitle],
    ...(item.tags ?? []).map((tag): [Match["where"], string] => ["tag", `#${tag}`]),
    ...comments.map((comment): [Match["where"], string] => ["comment", comment.text]),
    ["id", item.id],
  ];
}

/**
 * Items whose words contain the query, in reading order across the canvas: top to bottom, then
 * left to right, so Next walks the canvas the way eyes do. Hidden items are found too, marked.
 */
export function findMatches(items: Item[], comments: CanvasComment[], query: string): Match[] {
  const typed = query.trim().toLowerCase();
  if (!typed) return [];
  const hidden = hiddenIds(items);
  const byItem = new Map<string, CanvasComment[]>();
  for (const comment of comments)
    byItem.set(comment.on, [...(byItem.get(comment.on) ?? []), comment]);
  const matches: Match[] = [];
  for (const item of items) {
    if (item.onLine) continue;
    const found = texts(item, byItem.get(item.id) ?? []).find(([, text]) =>
      text.toLowerCase().includes(typed)
    );
    if (found) matches.push({ item, where: found[0], hidden: hidden.has(item.id) });
  }
  const order = (item: Item) => worldBounds([item]) ?? { x: 0, y: 0 };
  return matches.sort((a, b) => {
    const left = order(a.item);
    const right = order(b.item);
    return Math.round(left.y / 40) - Math.round(right.y / 40) || left.x - right.x;
  });
}

/** How a match reads in the list: its name or kind, and where the words were. */
export function describeMatch({ item, where, hidden }: Match) {
  const name = item.name.split("\n")[0] || typeLabel(item);
  const notes = [where === "name" ? "" : where, hidden ? "hidden" : ""].filter(Boolean);
  return notes.length ? `${name} (${notes.join(", ")})` : name;
}

/** Flies to a match and selects it when it is drawn. */
export function showMatch(editor: EditorController, match: Match) {
  const box = isBox(match.item) ? match.item : worldBounds([match.item]);
  if (box) flyToView(editor.graph, editor.element, fittingView(box, editor.element, FIND_FILL));
  if (!match.hidden) editor.select(match.item.id);
  else {
    editor.graph.clearSelection();
    editor.emit();
  }
}

/** Reveals this result and any hidden holder/end that hides it, leaving unrelated flags alone. */
export function revealMatch(editor: EditorController, match: Match) {
  const items = editor.document.list();
  const hidden = items.filter(
    (item) => item.hidden && removalClosure(items, [item.id]).has(match.item.id)
  );
  changeFields(
    editor.document,
    hidden.map((item) => item.id),
    { hidden: undefined }
  );
  const current = editor.document.get(match.item.id);
  if (current) showMatch(editor, { ...match, item: current, hidden: false });
}
