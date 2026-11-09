import { isMarkup } from "./ink";
import { removalClosure } from "./relations";
import type { Item } from "./types";

/**
 * Content layers stack the workspace in named collections beneath markup. A layer is a record in
 * the document's `layers` map; an item names its layer, and what a holder holds is in the
 * holder's layer whatever it names itself. The base layer always exists, needs a record only
 * once renamed or moved, and is where items naming no layer belong.
 */
export const BASE_LAYER = "base";
export const BASE_LAYER_NAME = "Workspace";

export interface LayerRecord {
  name: string;
  /** Stacking position among layers, bottom to top; ties break by id. */
  order: number;
}

export interface Layer extends LayerRecord {
  id: string;
}

/** Records peers write in an unknown shape are ignored, as items are. */
function isRecord(value: unknown): value is LayerRecord {
  const record = value as Partial<LayerRecord> | null;
  return typeof record?.name === "string" && typeof record.order === "number";
}

/** Every layer bottom to top, the base layer included. */
export function orderedLayers(records: Iterable<[string, unknown]>): Layer[] {
  const layers = new Map<string, Layer>([
    [BASE_LAYER, { id: BASE_LAYER, name: BASE_LAYER_NAME, order: 0 }],
  ]);
  for (const [id, record] of records)
    if (isRecord(record)) layers.set(id, { id, name: record.name, order: record.order });
  return [...layers.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Markup sits above every layer and slides beneath them all; neither belongs to one. */
export function inLayers(item: Item) {
  return !isMarkup(item) && item.type !== "slide";
}

/** The layer an item is in: its outermost holder's, or its own at the top level. */
export function layerOf(item: Item, byId: ReadonlyMap<string, Item> | Lookup) {
  const find: Lookup = typeof byId === "function" ? byId : (id) => byId.get(id);
  let root = item;
  const seen = new Set([item.id]);
  for (let holder = find(root.inside); holder && !seen.has(holder.id);) {
    seen.add(holder.id);
    root = holder;
    holder = find(root.inside);
  }
  return root.layer || BASE_LAYER;
}

type Lookup = (id: string) => Item | null | undefined;

/** A layer id that names no layer reads as the base layer, so a stale name never hides content. */
function rankOf(layers: Layer[]) {
  const rank = new Map(layers.map((layer, index) => [layer.id, index]));
  const base = rank.get(BASE_LAYER)!;
  return (id: string) => rank.get(id) ?? base;
}

/**
 * Items in drawing order: slides beneath everything, then each layer bottom to top, then markup.
 * Within a layer the given order stands, so callers pass items already in stacking order.
 */
export function layeredStack<T extends Item>(items: T[], layers: Layer[], byId = byIds(items)) {
  const rank = rankOf(layers);
  const key = (item: T) => {
    if (item.type === "slide") return -1;
    if (isMarkup(item)) return layers.length;
    return rank(layerOf(item, byId));
  };
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * What hiding these layers takes off one person's view: their items, what those hold, and lines
 * into any of them. Slides and markup ignore layer visibility.
 */
export function hiddenByLayers(items: Item[], hidden: ReadonlySet<string>, layers: Layer[]) {
  if (!hidden.size) return new Set<string>();
  const byId = byIds(items);
  const rank = rankOf(layers);
  const known = new Set(layers.map((layer) => layer.id));
  const resolved = (id: string) => (known.has(id) ? id : layers[rank(id)]!.id);
  const roots = items.filter((item) => inLayers(item) && hidden.has(resolved(layerOf(item, byId))));
  return roots.length
    ? removalClosure(
        items,
        roots.map((item) => item.id)
      )
    : new Set<string>();
}

export function byIds<T extends Item>(items: T[]) {
  return new Map<string, Item>(items.map((item) => [item.id, item]));
}
