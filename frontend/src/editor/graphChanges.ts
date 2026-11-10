import {
  GeometryChange,
  ValueChange,
  StyleChange,
  TerminalChange,
  type Cell,
  type Graph,
  type UndoableEdit,
} from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, isFrame, type Item, type PathPoint, type Port } from "../document/types";
import { offsetPoints } from "../document/geometry";
import { orphanedAnchors, removalClosure } from "../document/relations";
import { isUnderlay } from "./templates";
import { dockedFollowers } from "../document/docking";
import { TASKS_TAG } from "./stencils";
import { panelResizeChanges } from "../document/panelResize";
import { authoredLook } from "../document/appearance";

export function commitGraph(graph: Graph, document: CanvasDocument, edit?: UndoableEdit) {
  const before = document.list();
  const changed = changedCells(edit);
  if (changed) {
    document.doc.transact(() => {
      for (const cell of changed)
        if (cell.geometry && !isUnderlay(cell) && document.get(cell.id!)?.type !== "highlight")
          commitCell(cell, cellValues(cell, document), document);
      applyPanelResizes(document, before);
    }, LOCAL);
    return;
  }
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
      if (!removed.has(cell.id!) && document.get(cell.id!)?.type !== "highlight")
        commitCell(cell, values, document);
    });
    applyPanelResizes(document, before);
  }, LOCAL);
}

function applyPanelResizes(document: CanvasDocument, before: Item[]) {
  const changes = panelResizeChanges(before, document.list(), (item) =>
    authoredLook(item, document.namedStyle(item.style))
  );
  for (const { id, geometry, look } of changes) {
    document.patch(id, geometry);
    document.patchLook(id, look);
  }
}

/** Geometry edits include descendants whose world positions follow their holder. Structural
 * edits retain the full deletion/reparenting policy below, including ungrouping and new cells. */
function changedCells(edit?: UndoableEdit): Set<Cell> | null {
  if (!edit) return null;
  const cells = new Set<Cell>();
  for (const change of edit.changes) {
    if (change instanceof GeometryChange)
      change.cell.filterDescendants(() => true).forEach((cell) => cells.add(cell));
    else if (
      change instanceof ValueChange ||
      change instanceof StyleChange ||
      change instanceof TerminalChange
    )
      cells.add(change.cell);
    else return null;
  }
  return cells;
}

function commitCell(cell: Cell, values: Partial<Item>, document: CanvasDocument) {
  if (!cell.id || !cell.geometry) return;
  const existing = document.get(cell.id);
  if (existing) {
    commitExisting(cell, existing, values, document);
    return;
  }
  // maxGraph makes cells of its own when grouping, connecting, or ending a connector in space.
  const cloneOf = (cell.getStyle() as Record<string, unknown>).cloneOf;
  const template = typeof cloneOf === "string" ? document.get(cloneOf) : null;
  const type = cell.isEdge() ? "line" : (template?.type ?? "group");
  document.insert({
    ...document.build(type, 0, 0, { order: newCellOrder(cell, document) }),
    ...(template ? copiedFields(template) : {}),
    id: cell.id,
    ...values,
  });
}

/** What a connector's new far end takes from its source: its kind and look, not its words. */
function copiedFields(template: Item): Partial<Item> {
  return {
    stencil: template.stencil,
    style: template.style,
    look: { ...template.look },
    icon: template.icon,
    width: template.width,
    height: template.height,
  };
}

function commitExisting(
  cell: Cell,
  existing: Item,
  values: Partial<Item>,
  document: CanvasDocument
) {
  if (heightWasResized(existing, values)) document.patchLook(cell.id!, { textFit: "fixed" });
  // A collapsed frame is drawn as its title bar; the document keeps its full size.
  if (existing.collapsed && isFrame(existing)) delete values.height;
  followEdges(existing, values, document);
  joinTaskList(existing, values, document);
  document.patch(cell.id!, values);
  // Native rotation handles write the angle to the cell style, not its geometry.
  const rotation = cell.getStyle().rotation;
  if (rotation !== undefined && rotation !== existing.look.rotation)
    document.patchLook(cell.id!, { rotation });
  if (cell.isEdge()) commitPorts(cell, existing, document);
}

/** Frames docked to a resized frame's edges move their edges with it. */
function followEdges(existing: Item, values: Partial<Item>, document: CanvasDocument) {
  if (!isFrame(existing)) return;
  const after = { ...existing, ...values };
  const same = (a: number, b: number) => a === b;
  if (
    same(existing.x, after.x) &&
    same(existing.y, after.y) &&
    same(existing.width, after.width) &&
    same(existing.height, after.height)
  )
    return;
  for (const patch of dockedFollowers(document.list(), existing, existing, after))
    document.patch(patch.id, patch.values);
}

/** An object dragged into a task list becomes a task, as its neighbours are. */
function joinTaskList(existing: Item, values: Partial<Item>, document: CanvasDocument) {
  if (values.inside === undefined || values.inside === existing.inside || existing.task !== "none")
    return;
  const holder = document.get(values.inside);
  if (holder?.tags.includes(TASKS_TAG)) values.task = "open";
}

function heightWasResized(existing: Item, values: Partial<Item>) {
  return (
    existing.type === "text" &&
    values.height !== existing.height &&
    existing.look.textFit === "height"
  );
}

function portOf(style: Record<string, unknown>, prefix: "exit" | "entry"): Port | null {
  const x = style[`${prefix}X`];
  const y = style[`${prefix}Y`];
  return typeof x === "number" && typeof y === "number" ? [x, y] : null;
}

/** Dragging a line's end changes where it attaches through the cell style. */
function commitPorts(cell: Cell, existing: Item, document: CanvasDocument) {
  const style = cell.getStyle() as Record<string, unknown>;
  const fromPort = portOf(style, "exit");
  const toPort = portOf(style, "entry");
  const changed = (left: Port | null, right: Port | null) =>
    JSON.stringify(left) !== JSON.stringify(right);
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
