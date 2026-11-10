import type { Appearance } from "./appearance";
import { footprint, intersects } from "./layout";
import { isBox, type Item } from "./types";
import { visibleItems } from "./relations";

/**
 * What a layout check reports without drawing anything: boxes that overlap others they neither
 * hold nor sit in, objects outside their holder, and text that an estimate says will not fit.
 */
export interface LayoutReport {
  overlaps: [Item, Item][];
  escapes: { item: Item; holder: Item }[];
  overflows: { item: Item; needed: number; available: number }[];
}

/** Average glyph width as a fraction of the text size; monospace runs wider. */
const CHARACTER_WIDTH: Record<string, number> = { mono: 0.62 };
const DEFAULT_CHARACTER_WIDTH = 0.55;
/** An estimate only flags text that needs clearly more room than it has. */
const OVERFLOW_TOLERANCE = 1.1;
const CONTAINMENT_TOLERANCE = 0.5;
/** Types whose name is drawn inside their box; holders carry titles, icons label beneath. */
const INNER_TEXT_TYPES = new Set<Item["type"]>(["node", "note", "text", "card"]);

function solid(item: Item) {
  return isBox(item) && item.type !== "band" && item.type !== "slide" && !item.onLine;
}

function holds(byId: Map<string, Item>, outer: Item, inner: Item) {
  for (let id = inner.inside; id; id = byId.get(id)?.inside ?? "") if (id === outer.id) return true;
  return false;
}

function contains(outer: Item, inner: Item) {
  const t = CONTAINMENT_TOLERANCE;
  return (
    inner.x >= outer.x - t &&
    inner.y >= outer.y - t &&
    inner.x + inner.width <= outer.x + outer.width + t &&
    inner.y + inner.height <= outer.y + outer.height + t
  );
}

/** Lines of the name as they read, with Markdown markers taken off. */
function textLines(name: string) {
  return name.split("\n").map((line) =>
    line
      .replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, "")
      .replace(/[*_`~]/g, "")
      .trim()
  );
}

/** How tall the text would run in its box against the room it has; a blank line counts half. */
export function estimatedOverflow(item: Item, look: Appearance) {
  const width = item.width / look.scale - look.padding * 2;
  const size = look.textSize;
  const glyph = size * (CHARACTER_WIDTH[look.font] ?? DEFAULT_CHARACTER_WIDTH);
  const perLine = Math.max(1, Math.floor(width / (look.bold ? glyph * 1.05 : glyph)));
  const lines = textLines(item.name).reduce(
    (total, line) => total + (line ? Math.ceil(line.length / perLine) : 0.5),
    0
  );
  const needed = (lines * size * look.lineHeight + look.padding * 2) * look.scale;
  if (needed <= item.height * OVERFLOW_TOLERANCE + 4 * look.scale) return null;
  return { item, needed: Math.ceil(needed), available: Math.round(item.height) };
}

function hasInnerText(item: Item) {
  return (
    isBox(item) && item.name !== "" && INNER_TEXT_TYPES.has(item.type) && item.stencil !== "icon"
  );
}

/** Visible overlapping pairs, excluding containment, resolved with the document's appearance. */
export function overlappingPairs(all: Item[], chosen: Item[], lookOf: (item: Item) => Appearance) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const boxes = visibleItems(all).filter(solid);
  const visibleIds = new Set(boxes.map((item) => item.id));
  const seen = new Set<string>();
  const overlaps: [Item, Item][] = [];
  for (const item of chosen.filter((item) => visibleIds.has(item.id))) {
    const space = footprint(item, lookOf(item));
    for (const other of boxes) {
      if (other === item || holds(byId, other, item) || holds(byId, item, other)) continue;
      const key = [item.id, other.id].sort((a, b) => a.localeCompare(b)).join("\n");
      if (seen.has(key) || !intersects(space, footprint(other, lookOf(other)))) continue;
      seen.add(key);
      overlaps.push([item, other]);
    }
  }
  return overlaps;
}

export function layoutReport(
  all: Item[],
  chosen: Item[],
  lookOf: (item: Item) => Appearance
): LayoutReport {
  const byId = new Map(all.map((item) => [item.id, item]));
  const visible = visibleItems(all);
  const visibleIds = new Set(visible.map((item) => item.id));
  const inspected = chosen.filter((item) => visibleIds.has(item.id));
  const escapes = inspected.filter(solid).flatMap((item) => {
    const holder = byId.get(item.inside);
    return holder && isBox(holder) && !contains(holder, item) ? [{ item, holder }] : [];
  });
  const overflows = inspected.filter(hasInnerText).flatMap((item) => {
    const overflow = estimatedOverflow(item, lookOf(item));
    return overflow ? [overflow] : [];
  });
  return { overlaps: overlappingPairs(all, inspected, lookOf), escapes, overflows };
}

function label(item: Item) {
  const name = item.name.split("\n")[0];
  if (!name) return item.id;
  const shown = name.length > 24 ? `${name.slice(0, 23)}…` : name;
  return `${item.id} "${shown}"`;
}

/** The report as lines an agent reads, starting with what was looked at. */
export function describeLayout(report: LayoutReport, looked: number) {
  const lines = [`// Layout check: ${looked} objects looked at.`];
  if (report.overlaps.length)
    lines.push(
      `// Overlaps (${report.overlaps.length}): ${report.overlaps
        .map(([a, b]) => `${label(a)} and ${label(b)}`)
        .join("; ")}`
    );
  if (report.escapes.length)
    lines.push(
      `// Outside their holder (${report.escapes.length}): ${report.escapes
        .map(({ item, holder }) => `${label(item)} sticks out of ${holder.id}`)
        .join("; ")}`
    );
  if (report.overflows.length)
    lines.push(
      `// Text that may not fit (${report.overflows.length}, estimated): ${report.overflows
        .map(
          ({ item, needed, available }) =>
            `${label(item)} needs about ${needed} tall, has ${available}`
        )
        .join("; ")}`
    );
  if (lines.length === 1) lines.push("// Nothing to report: no overlaps, escapes or tight text.");
  return lines;
}
