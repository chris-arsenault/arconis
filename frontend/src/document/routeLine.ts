import { facing, routeAround, sideOf, type Box, type RouteEnd } from "./routing";
import { isBox, type Item, type Look, type PathPoint, type Port } from "./types";
import { footprint, intersects } from "./layout";
import { hiddenIds } from "./relations";

/**
 * Routing a line around items is a way of placing its points, done once: the line keeps its type,
 * and its points stay ordinary points people can drag.
 */

/** How far around its ends a line looks for items in its way. */
const SEARCH_MARGIN = 240;
/** Room kept between a line and the items it passes, at most. */
const CLEARANCE = 16;

function endOf(box: Box, other: Box, port: Port | null): RouteEnd {
  if (!port) return facing(box, other);
  const point = { x: box.x + box.width * port[0], y: box.y + box.height * port[1] };
  return { ...point, side: sideOf(box, point.x, point.y) };
}

function portOf(box: Box, end: RouteEnd): Port {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [round((end.x - box.x) / box.width), round((end.y - box.y) / box.height)];
}

/** Every box near the line with its labels, except its ends, what holds them, bands and hidden items. */
function obstacles(items: Item[], ends: Item[], area: Box, lookOf: (item: Item) => Look) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const excluded = hiddenIds(items);
  for (const end of ends)
    for (let id = end.id; id && !excluded.has(id); id = byId.get(id)?.inside ?? "")
      excluded.add(id);
  return items
    .filter((item) => isBox(item) && item.type !== "band" && !excluded.has(item.id))
    .map((item) => footprint(item, lookOf(item)))
    .filter((box) => intersects(box, area));
}

/**
 * Points that take a line around the items between its ends, and the ports it leaves and arrives by,
 * or null when it is boxed in. The points are the route's corners, which every line type passes
 * through: a cornered line's segments run between them, as maxGraph's segment routing reads them.
 */
export function routeLineAround(items: Item[], line: Item, lookOf: (item: Item) => Look) {
  const source = items.find((item) => item.id === line.from);
  const target = items.find((item) => item.id === line.to);
  if (!source || !target) return null;
  const from: Box = source;
  const to: Box = target;
  const start = endOf(from, to, line.fromPort);
  const end = endOf(to, from, line.toPort);
  const margin = Math.min(CLEARANCE, 0.2 * Math.min(from.width, from.height, to.width, to.height));
  const left = Math.min(from.x, to.x) - SEARCH_MARGIN;
  const top = Math.min(from.y, to.y) - SEARCH_MARGIN;
  const area = {
    x: left,
    y: top,
    width: Math.max(from.x + from.width, to.x + to.width) + SEARCH_MARGIN - left,
    height: Math.max(from.y + from.height, to.y + to.height) + SEARCH_MARGIN - top,
  };
  const corners = routeAround(start, end, obstacles(items, [source, target], area, lookOf), margin);
  if (!corners) return null;
  const points: PathPoint[] = corners;
  return { points, fromPort: portOf(from, start), toPort: portOf(to, end) };
}
