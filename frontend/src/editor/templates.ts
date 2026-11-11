import type { Cell } from "@maxgraph/core";
import { decks, isTemplate } from "../document/slides";
import { isBox, isLink, type Item, type PathPoint } from "../document/types";

/** Underlay ids begin with this, so they never collide with the document's. */
const UNDERLAY = "underlay:";

/**
 * What a deck's templates frame, drawn again under each of the deck's other slides. Underlays are
 * items of the graph alone, never of the document: they are computed from it on every projection,
 * placed within each slide as they sit within the template, and nothing can select, move, hold or
 * connect to them.
 */
export function underlays(items: Item[]): Item[] {
  const result: Item[] = [];
  for (const { slides } of decks(items)) {
    const templates = slides.filter(isTemplate);
    const shown = slides.filter((slide) => !isTemplate(slide));
    for (const template of templates)
      for (const slide of shown) result.push(...underlay(items, template, slide));
  }
  return result;
}

/** True for a cell the projection made from a template, which no edit may touch. */
export function isUnderlay(cell: Cell) {
  return (cell.getStyle() as Record<string, unknown>).underlay === true;
}

/** True for a cell the pointer leaves alone: a template's underlay, or an item in a locked layer. */
export function isPassive(cell: Cell) {
  const style = cell.getStyle() as Record<string, unknown>;
  return style.underlay === true || style.layerLocked === true;
}

function underlay(items: Item[], template: Item, slide: Item): Item[] {
  const held = framed(items, template);
  const ids = new Set(held.map((item) => item.id));
  const mapId = (id: string) => (ids.has(id) ? `${UNDERLAY}${slide.id}:${id}` : id);
  // A slide usually has its template's size; when it does not, the template scales to fit it.
  const scale = template.width ? slide.width / template.width : 1;
  const place = ([x, y]: PathPoint): PathPoint => [
    slide.x + (x - template.x) * scale,
    slide.y + (y - template.y) * scale,
  ];
  return held
    .filter((item) => !isLink(item) || (ids.has(item.from) && ids.has(item.to)))
    .map((item) => {
      const [x, y] = isBox(item) ? place([item.x, item.y]) : [item.x, item.y];
      return {
        ...item,
        id: mapId(item.id),
        inside: mapId(item.inside),
        from: mapId(item.from),
        to: mapId(item.to),
        x,
        y,
        width: isBox(item) ? item.width * scale : item.width,
        height: isBox(item) ? item.height * scale : item.height,
        points: item.points.map(place),
      };
    });
}

/**
 * What a template frames: top-level workspace items centred within its bounds, so text placed near
 * an edge still counts, with what they hold at any depth and the lines among them. Markup is
 * temporary and is never repeated.
 */
function framed(items: Item[], template: Item) {
  const within = ([x, y]: PathPoint) =>
    x >= template.x &&
    y >= template.y &&
    x <= template.x + template.width &&
    y <= template.y + template.height;
  const roots = items.filter(
    (item) =>
      !item.inside && !item.markup && item.type !== "slide" && !isLink(item) && within(centre(item))
  );
  return contents(items, roots);
}

function centre(item: Item): PathPoint {
  if (isBox(item)) return [item.x + item.width / 2, item.y + item.height / 2];
  if (!item.points.length) return [Number.NaN, Number.NaN];
  const xs = item.points.map(([x]) => x);
  const ys = item.points.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** The given items and everything they hold, at any depth, plus the lines among all of them. */
function contents(items: Item[], roots: Item[]) {
  const ids = new Set(roots.map((item) => item.id));
  const held: Item[] = [...roots];
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items)
      if (!ids.has(item.id) && ids.has(item.inside)) {
        ids.add(item.id);
        held.push(item);
        grew = true;
      }
  }
  const lines = items.filter(
    (item) => isLink(item) && !ids.has(item.id) && ids.has(item.from) && ids.has(item.to)
  );
  return [...held, ...lines];
}
