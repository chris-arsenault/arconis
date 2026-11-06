import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type CanvasObject } from "../document/types";

export function commitGraph(graph: Graph, document: CanvasDocument) {
  const cells = Object.values(graph.getDataModel().cells || {}).filter(
    (cell) => cell.isVertex() || cell.isEdge()
  );
  const present = new Set(cells.map((cell) => cell.id!));
  document.doc.transact(() => {
    document
      .list()
      .filter((item) => !present.has(item.id))
      .forEach((item) => document.objects.delete(item.id));
    cells.forEach((cell) => commitCell(cell, document));
  }, LOCAL);
}

function commitCell(cell: Cell, document: CanvasDocument) {
  if (!cell.id || !cell.geometry) return;
  const existing = document.get(cell.id);
  const { x, y, width, height, points } = cell.geometry;
  const values = cellValues(cell);
  const path = [...(points || [])];
  if (existing?.kind === "stroke") {
    if (cell.geometry.sourcePoint) path.unshift(cell.geometry.sourcePoint);
    if (cell.geometry.targetPoint) path.push(cell.geometry.targetPoint);
  }
  values.points = JSON.stringify(path.map((point) => [point.x, point.y]));
  if (existing) document.patch(cell.id, values);
  else {
    const kind = cell.isEdge() ? "connector" : "group";
    document.insert({
      id: cell.id,
      kind,
      label: "",
      x,
      y,
      width,
      height,
      parent: "",
      source: "",
      target: "",
      points: "[]",
      style: {},
      ...values,
    });
  }
}

function cellValues(cell: Cell): Partial<CanvasObject> {
  const { x, y, width, height } = cell.geometry!;
  return {
    label: String(cell.value || ""),
    x,
    y,
    width,
    height,
    parent: cell.parent?.isVertex() ? cell.parent.id! : "",
    source: cell.source?.id || "",
    target: cell.target?.id || "",
  };
}
