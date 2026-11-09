import type { CanvasDocument } from "./canvasDocument";
import { newId } from "./ids";
import {
  BASE_LAYER,
  BASE_LAYER_NAME,
  byIds,
  inLayers,
  layerOf,
  type Layer,
  type LayerRecord,
} from "./layers";
import { removalClosure } from "./relations";
import { LOCAL, type Item } from "./types";

/**
 * Layer operations as plans over plain values, so the document and the canvas language's draft
 * apply the same policy. Each plan names the layer records to set or drop and the item changes.
 */
export interface LayerPlan {
  set: Map<string, LayerRecord>;
  drop: string[];
  patches: Map<string, Partial<Item>>;
  remove: string[];
}

function emptyPlan(): LayerPlan {
  return { set: new Map(), drop: [], patches: new Map(), remove: [] };
}

/** Numbers layers 0, 1, 2 bottom to top in the given order, recording only what changes. */
function renumber(plan: LayerPlan, layers: Layer[]) {
  layers.forEach(({ id, name, order }, index) => {
    if (order !== index || plan.set.has(id)) plan.set.set(id, { name, order: index });
  });
}

/** A new layer at `at`, counted bottom to top; on top by default. */
export function planCreate(layers: Layer[], id: string, name: string, at = layers.length) {
  const plan = emptyPlan();
  const next = [...layers];
  next.splice(at, 0, { id, name, order: -1 });
  plan.set.set(id, { name, order: at });
  renumber(plan, next);
  return plan;
}

export function planRename(layers: Layer[], id: string, name: string) {
  const plan = emptyPlan();
  const layer = layers.find((l) => l.id === id);
  if (layer) plan.set.set(id, { name, order: layer.order });
  return plan;
}

/** Moves a layer to `index`, counted bottom to top. */
export function planMove(layers: Layer[], id: string, index: number) {
  const plan = emptyPlan();
  const from = layers.findIndex((l) => l.id === id);
  if (from < 0) return plan;
  const next = layers.filter((l) => l.id !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, layers[from]!);
  renumber(plan, next);
  return plan;
}

/** Top-level workspace items in a layer, in stacking order. */
export function layerRoots(items: Item[], id: string) {
  const byId = byIds(items);
  return items.filter((item) => !item.inside && inLayers(item) && layerOf(item, byId) === id);
}

/**
 * Moves top-level items onto the top of a layer, keeping their order among themselves. Contents
 * go with their holders, so held items are refused rather than torn from them.
 */
export function planMoveItems(items: Item[], ids: string[], to: string, nextOrder: () => number) {
  const plan = emptyPlan();
  const chosen = new Set(ids);
  const refused: string[] = [];
  for (const item of items) {
    if (!chosen.has(item.id) || !inLayers(item)) continue;
    if (item.inside) refused.push(item.id);
    else
      plan.patches.set(item.id, { layer: to === BASE_LAYER ? undefined : to, order: nextOrder() });
  }
  return { plan, refused };
}

/** Merges a layer into another: its items go on top of that layer, then the layer goes. */
export function planMerge(items: Item[], from: string, into: string, nextOrder: () => number) {
  const roots = layerRoots(items, from).map((item) => item.id);
  const { plan } = planMoveItems(items, roots, into, nextOrder);
  plan.drop.push(from);
  return plan;
}

/** Deletes a layer with everything in it. */
export function planDelete(items: Item[], id: string) {
  const plan = emptyPlan();
  plan.drop.push(id);
  plan.remove = [
    ...removalClosure(
      items,
      layerRoots(items, id).map((item) => item.id)
    ),
  ];
  return plan;
}

/** Why a layer operation cannot run, or nothing when it can. */
export function layerProblem(layers: Layer[], action: "merge" | "delete", id: string) {
  if (!layers.some((layer) => layer.id === id)) return `There is no layer "${id}".`;
  if (id === BASE_LAYER) return `The base layer stays; ${action} another layer instead.`;
  return "";
}

/** The layer beneath one, which Merge down merges it into. */
export function layerBelow(layers: Layer[], id: string) {
  const index = layers.findIndex((layer) => layer.id === id);
  return index > 0 ? layers[index - 1]!.id : "";
}

export function freshLayerId(layers: Iterable<string>) {
  const taken = new Set(layers);
  return newId((id) => id === BASE_LAYER || taken.has(id));
}

export function applyLayerPlan(document: CanvasDocument, plan: LayerPlan) {
  plan.set.forEach((record, id) => document.layers.set(id, record));
  plan.drop.forEach((id) => document.layers.delete(id));
  plan.patches.forEach((values, id) => document.patch(id, values));
  plan.remove.forEach((id) => document.items.delete(id));
}

/** Runs a plan as one undoable step. */
function step(document: CanvasDocument, plan: LayerPlan) {
  document.undo.stopCapturing();
  document.doc.transact(() => applyLayerPlan(document, plan), LOCAL);
  document.undo.stopCapturing();
}

/** The editor's layer commands: each is one undoable step for this participant. */
export const layerCommands = {
  /** A new layer just above `above`, or on top. */
  create(document: CanvasDocument, name: string, above?: string) {
    const layers = document.layerList();
    const id = freshLayerId(layers.map((layer) => layer.id));
    const below = layers.findIndex((layer) => layer.id === above);
    const at = below < 0 ? layers.length : below + 1;
    step(document, planCreate(layers, id, name || `Layer ${layers.length + 1}`, at));
    return id;
  },
  rename(document: CanvasDocument, id: string, name: string) {
    step(document, planRename(document.layerList(), id, name.trim() || BASE_LAYER_NAME));
  },
  move(document: CanvasDocument, id: string, index: number) {
    step(document, planMove(document.layerList(), id, index));
  },
  moveItems(document: CanvasDocument, ids: string[], to: string) {
    const { plan, refused } = planMoveItems(document.list(), ids, to, counter(document));
    step(document, plan);
    return refused;
  },
  mergeDown(document: CanvasDocument, id: string) {
    const layers = document.layerList();
    const into = layerBelow(layers, id);
    if (!into || layerProblem(layers, "merge", id)) return false;
    step(document, planMerge(document.list(), id, into, counter(document)));
    return true;
  },
  delete(document: CanvasDocument, id: string) {
    const layers = document.layerList();
    if (layerProblem(layers, "delete", id)) return false;
    step(document, planDelete(document.list(), id));
    return true;
  },
};

/** Stacking orders above everything, handed out one after another. */
function counter(document: CanvasDocument) {
  let next = document.nextOrder();
  return () => next++;
}
