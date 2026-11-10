import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import type { Item } from "../document/types";
import { isMarkup } from "../document/ink";
import { effectiveAppearance } from "../document/appearance";
import { drawInkGradient } from "./inkGradient";
import { underlays } from "./templates";

/** Annotations pass through to workspace objects unless selecting ink; content ink is ordinary content. */
export function refreshInkView(graph: Graph, document: CanvasDocument, lasso: boolean) {
  const items = [...underlays(document.list()), ...document.list()];
  const gradients = definitions(graph);
  const selected = new Set(graph.getSelectionCells().map((cell) => cell.id));
  for (const item of items) {
    const node = inkNode(graph, item.id);
    node?.classList.toggle("ink-pass-through", passesPointer(item, lasso || selected.has(item.id)));
    if (item.type === "drawing")
      drawInkGradient(
        node,
        effectiveAppearance(item, document.namedStyle(item.style)),
        `gradient-${document.doc.clientID}-${item.id}`,
        gradients
      );
  }
}

function definitions(graph: Graph) {
  const svg = graph.view.getDrawPane()?.closest("svg");
  svg?.querySelector("defs.ink-gradients")?.remove();
  const gradients = window.document.createElementNS("http://www.w3.org/2000/svg", "defs");
  gradients.classList.add("ink-gradients");
  svg?.prepend(gradients);
  return gradients;
}

function inkNode(graph: Graph, id: string) {
  const cell = graph.getDataModel().getCell(id);
  return cell ? graph.view.getState(cell)?.shape?.node : null;
}

function passesPointer(item: Item, selecting: boolean) {
  return item.type === "highlight" || (isMarkup(item) && !selecting);
}
