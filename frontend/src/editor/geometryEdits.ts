import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import type { Item } from "../document/types";

/** Changes a cell's geometry in world terms; the holder's origin is taken off for maxGraph. */
export function updateCellGeometry(
  graph: Graph,
  document: CanvasDocument,
  id: string,
  values: Partial<Pick<Item, "x" | "y" | "width" | "height">>
) {
  const model = graph.getDataModel();
  const cell = model.getCell(id);
  if (!cell?.geometry) return;
  const origin = document.get(cell.parent?.id || "") || { x: 0, y: 0 };
  const geometry = cell.geometry.clone();
  if (values.x !== undefined) geometry.x = values.x - origin.x;
  if (values.y !== undefined) geometry.y = values.y - origin.y;
  if (values.width !== undefined) geometry.width = values.width;
  if (values.height !== undefined) geometry.height = values.height;
  // A committed numeric field is one complete undo step, independent of the next field.
  document.undo.stopCapturing();
  model.setGeometry(cell, geometry);
  document.undo.stopCapturing();
}
