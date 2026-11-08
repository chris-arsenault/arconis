import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isMarkup } from "../document/ink";
import type { Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { drawInkGradient } from "./inkGradient";
import { underlays } from "./templates";

/** Pointer routing is a view concern; annotations never change workspace object styles. */
export function refreshInkView(
  graph: Graph,
  document: CanvasDocument,
  lasso: boolean,
  activeSketch = ""
) {
  const items = [...underlays(document.list()), ...document.list()];
  const byId = new Map(items.map((item) => [item.id, item]));
  const clips = drawingClips(graph, items, document);
  const gradients = createDefinitions(graph, "ink-gradients");
  const selected = new Set(graph.getSelectionCells().map((cell) => cell.id));
  for (const item of items) {
    const node = inkNode(graph, item.id);
    const sketch = byId.get(item.inside) ?? null;
    node?.classList.toggle(
      "ink-pass-through",
      passesPointer(item, sketch, lasso || selected.has(item.id), activeSketch)
    );
    const clip = clips.get(item.inside);
    if (clip) node?.setAttribute("clip-path", `url(#${clip})`);
    else node?.removeAttribute("clip-path");
    if (item.type === "drawing")
      drawInkGradient(
        node,
        effectiveAppearance(item, document.namedStyle(item.style)),
        `gradient-${document.doc.clientID}-${item.id}`,
        gradients
      );
  }
}

function createDefinitions(graph: Graph, name: string) {
  const svg = graph.view.getDrawPane()?.closest("svg");
  svg?.querySelector(`defs.${name}`)?.remove();
  const defs = window.document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.classList.add(name);
  svg?.prepend(defs);
  return defs;
}

function inkNode(graph: Graph, id: string) {
  const cell = graph.getDataModel().getCell(id);
  return cell ? graph.view.getState(cell)?.shape?.node : null;
}

function passesPointer(item: Item, parent: Item | null, lasso: boolean, active: string) {
  return (
    item.type === "highlight" ||
    (isMarkup(item) && !lasso) ||
    (parent?.type === "sketch" && active !== parent.id)
  );
}

/** SVG clipping is derived from canonical bounds and world coordinates, never saved as document data. */
function drawingClips(graph: Graph, items: Item[], document: CanvasDocument) {
  const defs = createDefinitions(graph, "ink-clips");
  const ids = new Map<string, string>();
  for (const item of items.filter((item) => item.type === "sketch")) {
    const cell = graph.getDataModel().getCell(item.id);
    const state = cell ? graph.view.getState(cell) : null;
    if (!state) continue;
    const id = `drawing-${document.doc.clientID}-${item.id}`;
    const clip = window.document.createElementNS(defs.namespaceURI, "clipPath");
    clip.setAttribute("id", id);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const rect = window.document.createElementNS(defs.namespaceURI, "rect");
    for (const key of ["x", "y", "width", "height"] as const)
      rect.setAttribute(key, String(state[key]));
    rect.setAttribute(
      "transform",
      `rotate(${effectiveAppearance(item, document.namedStyle(item.style)).rotation} ${state.x + state.width / 2} ${state.y + state.height / 2})`
    );
    clip.append(rect);
    defs.append(clip);
    ids.set(item.id, id);
  }
  return ids;
}
