import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";

/**
 * Locked items keep out of the way of pointer edits: a marquee passes over them and Select all
 * leaves them out, so only a direct click selects one, which is how it gets unlocked.
 */
export function configureLocking(graph: Graph, document: CanvasDocument) {
  const selectRegion = graph.selectRegion.bind(graph);
  graph.selectRegion = (rect, event) => {
    const cells = selectRegion(rect, event) ?? [];
    const free = cells.filter((cell) => !document.get(cell.id!)?.locked);
    if (free.length !== cells.length) graph.setSelectionCells(free);
    return free;
  };
}

/** Selects everything drawn at the top level except locked items. */
export function selectAll(graph: Graph, document: CanvasDocument) {
  const model = graph.getDataModel();
  const cells = document
    .list()
    .filter((item) => !item.locked)
    .map((item) => model.getCell(item.id))
    .filter((cell): cell is Cell => cell !== null && cell.parent === graph.getDefaultParent());
  graph.setSelectionCells(cells);
}
