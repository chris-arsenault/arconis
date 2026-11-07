import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type CanvasObject } from "../document/types";
import { offsetPoints } from "../document/geometry";

export function commitGraph(graph: Graph, document: CanvasDocument) {
  const cells = Object.values(graph.getDataModel().cells || {}).filter(
    (cell) => cell.isVertex() || cell.isEdge()
  );
  const present = new Set(cells.map((cell) => cell.id!));
  const changes = cells.map((cell) => ({ cell, values: cellValues(cell, document) }));
  document.doc.transact(() => {
    document.freezeLegacyGeometry();
    document
      .list()
      .filter((item) => !present.has(item.id))
      .forEach((item) => document.objects.delete(item.id));
    changes.forEach(({ cell, values }) => commitCell(cell, values, document));
  }, LOCAL);
}

function commitCell(cell: Cell, values: Partial<CanvasObject>, document: CanvasDocument) {
  if (!cell.id || !cell.geometry) return;
  const existing = document.get(cell.id);
  const { x, y, width, height } = cell.geometry;
  if (existing) {
    document.patch(cell.id, values);
    // Native rotation handles write the angle to the cell style, not its geometry.
    const rotation = cell.getStyle().rotation;
    if (rotation !== undefined && rotation !== existing.style.rotation)
      document.patchStyle(cell.id, { rotation });
  } else {
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
      order: newCellOrder(cell, document),
      style: {},
      ...values,
    });
  }
}

/** A new group stays at its highest member's level so grouping hides none of its members. */
function newCellOrder(cell: Cell, document: CanvasDocument) {
  const orders = cell
    .getChildren()
    .map((child) => document.get(child.id!)?.order)
    .filter((order) => order !== undefined);
  return orders.length ? Math.max(...orders) : document.nextOrder();
}

function cellValues(cell: Cell, document: CanvasDocument): Partial<CanvasObject> {
  const { x, y, width, height } = cell.geometry!;
  const origin = parentOrigin(cell);
  return {
    label: String(cell.value || ""),
    x: cell.isVertex() ? x + origin.x : x,
    y: cell.isVertex() ? y + origin.y : y,
    width,
    height,
    parent: cell.parent?.isVertex() ? cell.parent.id! : "",
    source: cell.source?.id || "",
    target: cell.target?.id || "",
    points: worldPoints(cell, document, origin),
  };
}

function parentOrigin(cell: Cell) {
  const origin = { x: 0, y: 0 };
  let parent = cell.parent;
  while (parent?.isVertex()) {
    origin.x += parent.geometry?.x || 0;
    origin.y += parent.geometry?.y || 0;
    parent = parent.parent;
  }
  return origin;
}

function worldPoints(cell: Cell, document: CanvasDocument, origin: { x: number; y: number }) {
  const geometry = cell.geometry!;
  const path = [...(geometry.points || [])];
  if (document.get(cell.id!)?.kind === "stroke") {
    if (geometry.sourcePoint) path.unshift(geometry.sourcePoint);
    if (geometry.targetPoint) path.push(geometry.targetPoint);
  }
  return offsetPoints(JSON.stringify(path.map((point) => [point.x, point.y])), origin.x, origin.y);
}
