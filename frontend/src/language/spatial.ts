import { inkBounds, highlighted } from "../document/ink";
import { BASE_LAYER, layerOf, type Layer } from "../document/layers";
import { facing } from "../document/routing";
import { isLink, type Item, type PathPoint, type Port } from "../document/types";

function endPoint(item: Item, other: Item, port: Port | null): PathPoint {
  if (port) return [item.x + item.width * port[0], item.y + item.height * port[1]];
  const { x, y } = facing(item, other);
  return [x, y];
}

/** Text order uses world geometry, never a connector's relative label position. */
function position(item: Item, byId: Map<string, Item>) {
  if (item.type === "drawing") return inkBounds(item.points);
  if (item.type === "highlight") return highlighted(item, byId);
  if (!isLink(item)) return item;
  const from = byId.get(item.from);
  const to = byId.get(item.to);
  const points = [...item.points];
  if (from && to) points.push(endPoint(from, to, item.fromPort), endPoint(to, from, item.toPort));
  return inkBounds(points);
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Input is drawing order. Exact content ties keep that order; geometry controls ordinary order. */
export function spatialOrder(
  items: Item[],
  layers: Layer[],
  statement: (item: Item) => string,
  contextItems = items
) {
  const byId = new Map(contextItems.map((item) => [item.id, item]));
  const rank = new Map(layers.map((layer, index) => [layer.id, index]));
  const context = (item: Item) => {
    if (item.type === "slide") return -1;
    if (item.markup) return layers.length + 1;
    return rank.get(layerOf(item, byId)) ?? rank.get(BASE_LAYER) ?? 0;
  };
  const keys = new Map(
    items.map((item, index) => [
      item,
      {
        context: context(item),
        stack: index,
        spot: position(item, byId),
        content: statement({ ...item, id: "" }),
      },
    ])
  );
  return (left: Item, right: Item) => {
    const a = keys.get(left)!;
    const b = keys.get(right)!;
    return (
      a.context - b.context ||
      a.spot.y - b.spot.y ||
      a.spot.x - b.spot.x ||
      compareText(left.type, right.type) ||
      compareText(left.name, right.name) ||
      left.order - right.order ||
      compareText(a.content, b.content) ||
      a.stack - b.stack
    );
  };
}
