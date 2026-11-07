import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";

/** The topmost panel containing a world point, so objects placed inside one join it. */
export function panelAt(document: CanvasDocument, x: number, y: number) {
  const items = document.list();
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (
      item.kind === "panel" &&
      x >= item.x &&
      y >= item.y &&
      x <= item.x + item.width &&
      y <= item.y + item.height
    )
      return item.id;
  }
  return "";
}

export function configurePanels(graph: Graph, document: CanvasDocument) {
  // Clicking a panel's body selects the panel, so it moves like any other object.
  graph.setSwimlaneSelectionEnabled(false);
  // A group's frame follows its members. A panel keeps the size it was given.
  graph.isExtendParent = (cell) =>
    !cell.isEdge() && document.get(cell.parent?.id ?? "")?.kind === "group";
  graph.isConstrainChild = () => false;
}
