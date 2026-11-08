import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, type Item, type PathPoint, type Port } from "../document/types";
import { offsetPoints } from "../document/geometry";
import { orphanedAnchors, removalClosure } from "../document/relations";
import { isUnderlay } from "./templates";

export function commitGraph(graph: Graph, document: CanvasDocument) {
  // Underlays are the projection's own cells, drawn from templates; they never reach the document.
  const cells = Object.values(graph.getDataModel().cells || {}).filter(
    (cell) => (cell.isVertex() || cell.isEdge()) && !isUnderlay(cell)
  );
  const present = new Set(cells.map((cell) => cell.id!));
  const items = document.list();
  const changes = cells.map((cell) => ({ cell, values: cellValues(cell, document) }));
  const currentValues = new Map(changes.map(({ cell, values }) => [cell.id, values]));
  // Ungrouping removes the holder but reparents its surviving children in this same graph edit.
  const resulting = items.map((item) => ({ ...item, ...currentValues.get(item.id) }));
  const removed = removalClosure(resulting, [
    ...items.filter((item) => !present.has(item.id)).map((item) => item.id),
    ...orphanedAnchors(resulting),
  ]);
  document.doc.transact(() => {
    removed.forEach((id) => document.items.delete(id));
    changes.forEach(({ cell, values }) => {
      if (!removed.has(cell.id!)) commitCell(cell, values, document);
    });
  }, LOCAL);
}

function commitCell(cell: Cell, values: Partial<Item>, document: CanvasDocument) {
  if (!cell.id || !cell.geometry) return;
  const existing = document.get(cell.id);
  if (existing) {
    if (heightWasResized(existing, values)) document.patchLook(cell.id, { textFit: "fixed" });
    document.patch(cell.id, values);
    // Native rotation handles write the angle to the cell style, not its geometry.
    const rotation = cell.getStyle().rotation;
    if (rotation !== undefined && rotation !== existing.look.rotation)
      document.patchLook(cell.id, { rotation });
    if (cell.isEdge()) commitPorts(cell, existing, document);
  } else {
    // maxGraph makes cells of its own only when grouping or connecting.
    const type = cell.isEdge() ? "line" : "group";
    document.insert({
      ...document.build(type, 0, 0, { order: newCellOrder(cell, document) }),
      id: cell.id,
      ...values,
    });
  }
}

function heightWasResized(existing: Item, values: Partial<Item>) {
  return (
    existing.type === "text" &&
    values.height !== existing.height &&
    existing.look.textFit === "height"
  );
}

function portOf(style: Record<string, unknown>, prefix: "exit" | "entry"): Port | undefined {
  const x = style[`${prefix}X`];
  const y = style[`${prefix}Y`];
  return typeof x === "number" && typeof y === "number" ? [x, y] : undefined;
}

/** Dragging a line's end changes where it attaches through the cell style. */
function commitPorts(cell: Cell, existing: Item, document: CanvasDocument) {
  const style = cell.getStyle() as Record<string, unknown>;
  const fromPort = portOf(style, "exit");
  const toPort = portOf(style, "entry");
  const changed = (left?: Port, right?: Port) => JSON.stringify(left) !== JSON.stringify(right);
  if (changed(fromPort, existing.fromPort) || changed(toPort, existing.toPort))
    document.patch(cell.id!, { fromPort, toPort });
}

/** A new group stays at its highest member's level so grouping hides none of its members. */
function newCellOrder(cell: Cell, document: CanvasDocument) {
  const orders = cell
    .getChildren()
    .map((child) => document.get(child.id!)?.order)
    .filter((order) => order !== undefined);
  return orders.length ? Math.max(...orders) : document.nextOrder();
}

function cellValues(cell: Cell, document: CanvasDocument): Partial<Item> {
  const { x, y, width, height } = cell.geometry!;
  const origin = parentOrigin(cell);
  return {
    name: String(cell.value || ""),
    x: cell.isVertex() ? x + origin.x : x,
    y: cell.isVertex() ? y + origin.y : y,
    width,
    height,
    inside: cell.parent?.isVertex() ? cell.parent.id! : "",
    from: cell.source?.id || "",
    to: cell.target?.id || "",
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
  if (document.get(cell.id!)?.type === "drawing") {
    if (geometry.sourcePoint) path.unshift(geometry.sourcePoint);
    if (geometry.targetPoint) path.push(geometry.targetPoint);
  }
  return offsetPoints(
    path.map((point): PathPoint => [point.x, point.y]),
    origin.x,
    origin.y
  );
}
