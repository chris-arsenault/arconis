import type { Graph, SelectionHandler } from "@maxgraph/core";

/**
 * maxGraph answers a plain click on an item that is already selected by selecting what holds it.
 * Here the item stays selected, so the second click of a double-click on a note in a frame leaves
 * the selection on the note whose text it opens.
 */
export function keepSelectionOnReclick(graph: Graph) {
  const handler = graph.getPlugin<SelectionHandler>("SelectionHandler");
  if (!handler) return;
  const propagates = handler.isPropagateSelectionCell.bind(handler);
  handler.isPropagateSelectionCell = (cell, immediate, event) =>
    (immediate || !graph.isCellSelected(cell)) && propagates(cell, immediate, event);
}
