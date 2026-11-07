import { Cell, Geometry, Graph, Point, type CellStyle } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import type { CanvasObject } from "../document/types";
import { objectStyle } from "./styles";
import { isContainerKind, offsetPoints } from "../document/geometry";

function safeParent(item: CanvasObject, all: Map<string, CanvasObject>) {
  const visited = new Set([item.id]);
  let parent = item.parent;
  while (parent) {
    if (visited.has(parent)) return "";
    visited.add(parent);
    const ancestor = all.get(parent);
    if (!ancestor || !isContainerKind(ancestor.kind)) return "";
    parent = ancestor.parent;
  }
  return item.parent;
}

export function projectDocument(graph: Graph, document: CanvasDocument) {
  const model = graph.getDataModel();
  const all = new Map(document.list().map((item) => [item.id, item]));
  const visible = new Map(
    [...all].filter(
      ([, item]) => item.kind !== "connector" || (all.has(item.source) && all.has(item.target))
    )
  );
  const parent = graph.getDefaultParent();
  model.beginUpdate();
  try {
    Object.values(model.cells || {})
      .filter((cell) => cell.id && cell.id !== "0" && cell.id !== "1" && !visible.has(cell.id))
      .forEach((cell) => model.remove(cell));
    visible.forEach((item) => {
      let cell = model.getCell(item.id);
      if (!cell) {
        cell = new Cell(item.label, new Geometry(), objectStyle(item));
        cell.setId(item.id);
        cell.setVertex(!["connector", "stroke"].includes(item.kind));
        cell.setEdge(["connector", "stroke"].includes(item.kind));
        model.add(parent, cell);
      }
    });
    const vertices = [...visible.values()].filter(
      (item) => !["connector", "stroke"].includes(item.kind)
    );
    const edges = [...visible.values()].filter((item) =>
      ["connector", "stroke"].includes(item.kind)
    );
    for (const item of [...vertices, ...edges]) {
      const parentId = safeParent(item, all);
      updateCell(graph, item, model.getCell(item.id)!, model.getCell(parentId) || parent, all);
    }
    applyStacking(graph, visible);
  } finally {
    model.endUpdate();
  }
}

function applyStacking(graph: Graph, visible: Map<string, CanvasObject>) {
  const model = graph.getDataModel();
  const nextIndex = new Map<Cell, number>();
  // `visible` follows document stacking order, so each parent's children arrive in order.
  for (const id of visible.keys()) {
    const cell = model.getCell(id)!;
    const parent = cell.parent!;
    const index = nextIndex.get(parent) ?? 0;
    nextIndex.set(parent, index + 1);
    if (parent.getChildAt(index) !== cell) model.add(parent, cell, index);
  }
}

function updateCell(
  graph: Graph,
  item: CanvasObject,
  cell: Cell,
  parent: Cell,
  all: Map<string, CanvasObject>
) {
  const model = graph.getDataModel();
  if (cell.parent !== parent) model.add(parent, cell);
  if (cell.value !== item.label) model.setValue(cell, item.label);
  const style = objectStyle(item);
  const currentStyle = cell.getStyle();
  if (!stylesEqual(style, currentStyle)) model.setStyle(cell, style);
  if (cell.isEdge()) attachTerminals(graph, item, cell);
  const origin = all.get(cell.parent!.id!) || { x: 0, y: 0 };
  const geometry = cell.isEdge()
    ? edgeGeometry(item, origin)
    : new Geometry(item.x - origin.x, item.y - origin.y, item.width, item.height);
  if (!cell.geometry?.equals(geometry)) model.setGeometry(cell, geometry);
}

function edgeGeometry(item: CanvasObject, origin: { x: number; y: number }) {
  const geometry = new Geometry(item.x, item.y, item.width, item.height);
  geometry.relative = true;
  const points = JSON.parse(offsetPoints(item.points, -origin.x, -origin.y)) as [number, number][];
  if (item.kind === "stroke" && points.length) {
    geometry.sourcePoint = new Point(...points[0]);
    geometry.targetPoint = new Point(...points[points.length - 1]);
    geometry.points = points.slice(1, -1).map((p) => new Point(...p));
  } else geometry.points = points.map((p) => new Point(...p));
  return geometry;
}

function attachTerminals(graph: Graph, item: CanvasObject, cell: Cell) {
  const model = graph.getDataModel();
  const source = model.getCell(item.source);
  const target = model.getCell(item.target);
  if (cell.source !== source) model.setTerminal(cell, source, true);
  if (cell.target !== target) model.setTerminal(cell, target, false);
}

function stylesEqual(style: CellStyle, current: CellStyle) {
  return (
    Object.keys(style).length === Object.keys(current).length &&
    Object.entries(style).every(([key, value]) => current[key as keyof CellStyle] === value)
  );
}
