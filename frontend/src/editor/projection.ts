import { Cell, Geometry, Graph, Point, type CellStyle } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import type { CanvasObject } from "../document/types";
import { objectStyle } from "./styles";

function safeParent(item: CanvasObject, all: Map<string, CanvasObject>) {
  const visited = new Set([item.id]);
  let parent = item.parent;
  while (parent) {
    if (visited.has(parent)) return "";
    visited.add(parent);
    const ancestor = all.get(parent);
    if (ancestor?.kind !== "group") return "";
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
    visible.forEach((item) =>
      updateCell(
        graph,
        item,
        model.getCell(item.id)!,
        model.getCell(safeParent(item, all)) || parent
      )
    );
  } finally {
    model.endUpdate();
  }
}

function updateCell(graph: Graph, item: CanvasObject, cell: Cell, parent: Cell) {
  const model = graph.getDataModel();
  if (cell.parent !== parent) model.add(parent, cell);
  if (cell.value !== item.label) model.setValue(cell, item.label);
  const style = objectStyle(item);
  const currentStyle = cell.getStyle();
  if (!stylesEqual(style, currentStyle)) model.setStyle(cell, style);
  const geometry = new Geometry(item.x, item.y, item.width, item.height);
  if (cell.isEdge()) {
    geometry.relative = true;
    const points = JSON.parse(item.points) as [number, number][];
    if (item.kind === "stroke" && points.length) {
      geometry.sourcePoint = new Point(...points[0]);
      geometry.targetPoint = new Point(...points[points.length - 1]);
      geometry.points = points.slice(1, -1).map((p) => new Point(...p));
    } else geometry.points = points.map((p) => new Point(...p));
    model.setTerminal(cell, model.getCell(item.source), true);
    model.setTerminal(cell, model.getCell(item.target), false);
  }
  if (!cell.geometry?.equals(geometry)) model.setGeometry(cell, geometry);
}

function stylesEqual(style: CellStyle, current: CellStyle) {
  return (
    Object.keys(style).length === Object.keys(current).length &&
    Object.entries(style).every(([key, value]) => current[key as keyof CellStyle] === value)
  );
}
