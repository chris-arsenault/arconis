import { Cell, Geometry, Graph, Point, type CellStyle } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isBox, isLink, type Item } from "../document/types";
import { objectStyle } from "./styles";
import { offsetPoints } from "../document/geometry";

function safeParent(item: Item, all: Map<string, Item>) {
  const visited = new Set([item.id]);
  let parent = item.inside;
  while (parent) {
    if (visited.has(parent)) return "";
    visited.add(parent);
    const ancestor = all.get(parent);
    if (!ancestor || !isBox(ancestor)) return "";
    parent = ancestor.inside;
  }
  return item.inside;
}

export function projectDocument(graph: Graph, document: CanvasDocument, presenting = false) {
  const model = graph.getDataModel();
  const all = new Map(document.list().map((item) => [item.id, item]));
  const parent = graph.getDefaultParent();
  model.beginUpdate();
  try {
    Object.values(model.cells || {})
      .filter((cell) => cell.id && cell.id !== "0" && cell.id !== "1" && !all.has(cell.id))
      .forEach((cell) => model.remove(cell));
    all.forEach((item) => {
      let cell = model.getCell(item.id);
      if (!cell) {
        cell = new Cell(item.name, new Geometry(), {});
        cell.setId(item.id);
        cell.setVertex(isBox(item));
        cell.setEdge(!isBox(item));
        model.add(parent, cell);
      }
    });
    const boxes = [...all.values()].filter(isBox);
    const paths = [...all.values()].filter((item) => !isBox(item));
    for (const item of [...boxes, ...paths]) {
      const parentId = safeParent(item, all);
      updateCell(graph, document, item, model.getCell(parentId) || parent, all, presenting);
    }
    applyStacking(graph, all);
  } finally {
    model.endUpdate();
  }
}

function applyStacking(graph: Graph, visible: Map<string, Item>) {
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
  document: CanvasDocument,
  item: Item,
  parent: Cell,
  all: Map<string, Item>,
  presenting: boolean
) {
  const model = graph.getDataModel();
  const cell = model.getCell(item.id)!;
  if (cell.parent !== parent) model.add(parent, cell);
  if (cell.value !== item.name) model.setValue(cell, item.name);
  const style = objectStyle(item, document.namedStyle(item.style), presenting);
  if (!stylesEqual(style, cell.getStyle())) model.setStyle(cell, style);
  if (isLink(item)) attachTerminals(graph, item, cell);
  const origin = all.get(cell.parent!.id!) || { x: 0, y: 0 };
  const geometry = cell.isEdge()
    ? edgeGeometry(item, origin)
    : new Geometry(item.x - origin.x, item.y - origin.y, item.width, item.height);
  if (!cell.geometry?.equals(geometry)) model.setGeometry(cell, geometry);
}

/** A line's x and y place its label along it, as maxGraph's relative edge geometry does. */
function edgeGeometry(item: Item, origin: { x: number; y: number }) {
  const geometry = new Geometry(item.x, item.y, item.width, item.height);
  geometry.relative = true;
  const points = offsetPoints(item.points, -origin.x, -origin.y);
  if (item.type === "drawing" && points.length) {
    geometry.sourcePoint = new Point(...points[0]);
    geometry.targetPoint = new Point(...points[points.length - 1]);
    geometry.points = points.slice(1, -1).map((p) => new Point(...p));
  } else geometry.points = points.map((p) => new Point(...p));
  return geometry;
}

function attachTerminals(graph: Graph, item: Item, cell: Cell) {
  const model = graph.getDataModel();
  const source = model.getCell(item.from);
  const target = model.getCell(item.to);
  if (cell.source !== source) model.setTerminal(cell, source, true);
  if (cell.target !== target) model.setTerminal(cell, target, false);
}

function stylesEqual(style: CellStyle, current: CellStyle) {
  return (
    Object.keys(style).length === Object.keys(current).length &&
    Object.entries(style).every(([key, value]) => current[key as keyof CellStyle] === value)
  );
}
