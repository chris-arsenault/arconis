import { isId } from "../document/ids";
import {
  layerProblem,
  planCreate,
  planDelete,
  planMerge,
  planMove,
  planRename,
  type LayerPlan,
} from "../document/layerCommands";
import { BASE_LAYER, inLayers, orderedLayers, type Layer } from "../document/layers";
import type { Item } from "../document/types";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Statement } from "./syntax";

/**
 * Layers in the canvas language: `layer <id> "Name" above|below <id>` declares, renames or moves
 * one, `merge <id> into <id>` merges, `delete layer <id>` deletes one with its items, and an
 * item's `in-layer <id>` puts it in a layer. They share `document/layerCommands.ts` with the editor.
 */
export function draftLayers(draft: Draft): Layer[] {
  return orderedLayers(draft.layers.entries());
}

function known(draft: Draft, id: string, line: number) {
  if (!draftLayers(draft).some((layer) => layer.id === id))
    throw new LanguageError(
      `There is no layer "${id}". Declare it with: layer ${id} "Name".`,
      line
    );
  return id;
}

/** An item's `layer` attribute: checked against the layers so far, held items refused later. */
export function assignLayer(draft: Draft, item: Item, ref: string, line: number) {
  if (!inLayers(item)) throw new LanguageError("Markup and slides belong to no layer.", line);
  known(draft, ref, line);
  if (ref === BASE_LAYER) delete item.layer;
  else item.layer = ref;
  draft.layered.push({ id: item.id, line });
}

/** Contents are in their holder's layer, so a held item naming its own is refused. */
export function checkLayers(draft: Draft) {
  for (const { id, line } of draft.layered) {
    const item = draft.items.get(id);
    if (item?.inside)
      throw new LanguageError(
        `"${id}" is inside "${item.inside}" and so in its layer; move the holder, or the item out of it.`,
        line
      );
  }
}

function apply(draft: Draft, plan: LayerPlan) {
  plan.set.forEach((record, id) => draft.layers.set(id, record));
  plan.drop.forEach((id) => draft.layers.delete(id));
  plan.patches.forEach((values, id) => {
    const item = draft.items.get(id);
    if (!item) return;
    Object.assign(item, values);
    if (values.layer === undefined) delete item.layer;
  });
  plan.remove.forEach((id) => draft.remove(id));
}

type LayerStatement = Extract<Statement, { kind: "layer" | "merge" | "dropLayer" }>;

export function writeLayer(draft: Draft, statement: LayerStatement, importing: boolean) {
  if (statement.kind === "layer") declareLayer(draft, statement, importing);
  else if (statement.kind === "merge") mergeLayer(draft, statement);
  else {
    const problem = layerProblem(draftLayers(draft), "delete", statement.id);
    if (problem) throw new LanguageError(problem, statement.line);
    apply(draft, planDelete([...draft.items.values()], statement.id));
  }
}

/** Where `above` or `below` puts a layer among the others, counted bottom to top. */
function placeAmong(draft: Draft, statement: Extract<LayerStatement, { kind: "layer" }>) {
  const { place, id, line } = statement;
  if (!place) return undefined;
  known(draft, place.ref, line);
  const others = draftLayers(draft).filter((layer) => layer.id !== id);
  return others.findIndex((layer) => layer.id === place.ref) + (place.relation === "above" ? 1 : 0);
}

function declareLayer(
  draft: Draft,
  statement: Extract<LayerStatement, { kind: "layer" }>,
  importing: boolean
) {
  const { id, name, line } = statement;
  if (!isId(id)) throw new LanguageError(`"${id}" cannot be a layer's id.`, line);
  // A file opened into a room adds its layers but leaves the room's own as they are.
  if (importing && draft.document.layers.has(id)) return;
  const at = placeAmong(draft, statement);
  const layers = draftLayers(draft);
  if (!layers.some((layer) => layer.id === id)) {
    apply(draft, planCreate(layers, id, name ?? id, at));
    return;
  }
  if (name !== undefined) apply(draft, planRename(layers, id, name));
  if (at !== undefined) apply(draft, planMove(draftLayers(draft), id, at));
}

function mergeLayer(
  draft: Draft,
  { from, into, line }: Extract<LayerStatement, { kind: "merge" }>
) {
  const problem = layerProblem(draftLayers(draft), "merge", from);
  if (problem) throw new LanguageError(problem, line);
  known(draft, into, line);
  if (into === from) throw new LanguageError("Merge a layer into a different one.", line);
  apply(
    draft,
    planMerge([...draft.items.values()], from, into, () => draft.nextOrder())
  );
}
