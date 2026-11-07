import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isBox } from "../document/types";

/**
 * The smallest object at a world point that is larger than something being placed there, so a new
 * object joins whatever it lands inside. That is how detail gets added: zoom into any object and
 * place things in it.
 */
export function containerAt(
  document: CanvasDocument,
  x: number,
  y: number,
  size: { width: number; height: number }
) {
  let best = "";
  let bestArea = Number.POSITIVE_INFINITY;
  const newArea = size.width * size.height;
  for (const item of document.list()) {
    const area = item.width * item.height;
    if (
      isBox(item) &&
      // A band marks out a span of the canvas without holding what lies on it.
      item.type !== "band" &&
      area > newArea &&
      area < bestArea &&
      x >= item.x &&
      y >= item.y &&
      x <= item.x + item.width &&
      y <= item.y + item.height
    ) {
      best = item.id;
      bestArea = area;
    }
  }
  return best;
}

export function configurePanels(graph: Graph, document: CanvasDocument) {
  // Clicking a panel's body selects the panel, so it moves like any other object.
  graph.setSwimlaneSelectionEnabled(false);
  // A group's frame follows its members. A panel keeps the size it was given.
  graph.isExtendParent = (cell) =>
    !cell.isEdge() && document.get(cell.parent?.id ?? "")?.type === "group";
  graph.isConstrainChild = () => false;
}
