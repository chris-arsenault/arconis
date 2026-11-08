import type { Cell } from "@maxgraph/core";
import { decks, isTemplate } from "../document/slides";
import { isBox, isLink, type Item, type PathPoint } from "../document/types";

/** Underlay ids begin with this, so they never collide with the document's. */
const UNDERLAY = "underlay:";

/**
 * What a deck's templates hold, drawn again under each of the deck's other slides. Underlays are
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

function underlay(items: Item[], template: Item, slide: Item): Item[] {
  const held = contents(items, template.id);
  const ids = new Set(held.map((item) => item.id));
  const mapId = (id: string) => {
    if (id === template.id) return slide.id;
    return ids.has(id) ? `${UNDERLAY}${slide.id}:${id}` : id;
  };
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

/** Everything held inside an item, at any depth, plus the lines between those items. */
function contents(items: Item[], root: string) {
  const ids = new Set([root]);
  const held: Item[] = [];
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
