import type { CanvasComment } from "../document/comments";
import { worldBounds } from "../document/relations";
import { isBox, typeLabel, type Item } from "../document/types";
import type { EditorController } from "./controller";
import { fittingView, flyToView } from "./views";
import { EMPTY_FILTER, filterMatches, isEmptyFilter, type Filter } from "./filter";
import { MARKER_LABELS } from "./markerLabels";

/** How much of the window a found object fills, enough to see what is around it. */
const FIND_FILL = 0.3;

export interface Match {
  item: Item;
  /** The field that matched, or a metadata filter when no words were entered. */
  where: "name" | "subtitle" | "tag" | "marker" | "comment" | "id" | "filter";
}

/** What find looks through on an item: its own words, and the comments on it. */
function texts(item: Item, comments: CanvasComment[]): [Match["where"], string][] {
  return [
    ["name", item.name],
    ["subtitle", item.subtitle],
    ...item.tags.map((tag): [Match["where"], string] => ["tag", `#${tag}`]),
    ...(item.marker !== "none"
      ? [["marker", `${item.marker} ${MARKER_LABELS[item.marker]}`] as [Match["where"], string]]
      : []),
    ...comments.map((comment): [Match["where"], string] => ["comment", comment.text]),
    ["id", item.id],
  ];
}

function matchingField(
  item: Item,
  comments: CanvasComment[],
  typed: string
): Match["where"] | undefined {
  if (!typed) return "filter";
  return texts(item, comments).find(([where, text]) => {
    if (typed.startsWith("#")) return where === "tag" && text.toLowerCase() === typed;
    if (typed.startsWith(":")) return where === "marker" && item.marker === typed.slice(1);
    return text.toLowerCase().includes(typed);
  })?.[0];
}

/**
 * Items whose words contain the query, in reading order across the canvas: top to bottom, then
 * left to right, so Next walks the canvas the way eyes do.
 */
export function findMatches(
  items: Item[],
  comments: CanvasComment[],
  query: string,
  filter: Filter = EMPTY_FILTER
): Match[] {
  const typed = query.trim().toLowerCase();
  const filtering = !isEmptyFilter(filter);
  if (!typed && !filtering) return [];
  const allowed = filtering ? filterMatches(items, filter) : null;
  const byItem = new Map<string, CanvasComment[]>();
  for (const comment of comments)
    byItem.set(comment.on, [...(byItem.get(comment.on) ?? []), comment]);
  const candidates = items.filter((item) => !item.onLine && (!allowed || allowed.has(item.id)));
  const matches: Match[] = [];
  for (const item of candidates) {
    const where = matchingField(item, byItem.get(item.id) ?? [], typed);
    if (where) matches.push({ item, where });
  }
  return matches.sort(readingOrder);
}

function readingOrder(a: Match, b: Match) {
  const order = (item: Item) => worldBounds([item]) ?? { x: 0, y: 0 };
  const left = order(a.item);
  const right = order(b.item);
  return Math.round(left.y / 40) - Math.round(right.y / 40) || left.x - right.x;
}

/** How a match reads in the list: its name or kind, and where the words were. */
export function describeMatch({ item, where }: Match) {
  const name = item.name.split("\n")[0] || typeLabel(item);
  return where === "name" || where === "filter" ? name : `${name} (${where})`;
}

/** Flies to a match and selects it. */
export function showMatch(editor: EditorController, match: Match) {
  const box = isBox(match.item) ? match.item : worldBounds([match.item]);
  if (box) flyToView(editor.graph, editor.element, fittingView(box, editor.element, FIND_FILL));
  editor.select(match.item.id);
}
