import type { Graph } from "@maxgraph/core";
import type { CanvasObject, ObjectKind, StyleValue } from "../document/types";

export const MIN_SCALE = 0.001;
export const MAX_SCALE = 1000;
const GRID_PIXELS = 10;
const DOT_PIXELS = 20;

export function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomLabel(scale: number) {
  const percent = scale * 100;
  return `${percent < 10 ? Number(percent.toFixed(1)) : Math.round(percent)}%`;
}

/** Keeps the snapping grid about the same size on screen at every zoom. */
export function gridForScale(scale: number) {
  return 10 ** Math.round(Math.log10(GRID_PIXELS / scale));
}

/** Rounds a world coordinate finely enough for sub-pixel accuracy at this zoom. */
export function roundForScale(value: number, scale: number) {
  const precision = 10 ** Math.max(2, Math.ceil(Math.log10(scale)) + 2);
  return Math.round(value * precision) / precision;
}

/** New objects appear at a familiar on-screen size, in steps so nearby zooms give equal sizes. */
function creationFactor(scale: number) {
  return 2 ** -Math.round(Math.log2(scale));
}

export function creationOffset(scale: number) {
  return creationFactor(scale);
}

const STYLE_DEFAULTS: Partial<Record<ObjectKind, Record<string, number>>> = {
  sticky: { fontSize: 16, spacing: 20 },
  text: { fontSize: 22, spacing: 14 },
  connector: { fontSize: 14, strokeWidth: 2, startSize: 6, endSize: 6 },
  stroke: { strokeWidth: 3 },
};
const SHAPE_STYLE = { fontSize: 14, spacing: 14, strokeWidth: 1 };

/** Size and style for an object created at this zoom. Empty near 100%. */
export function creationValues(kind: ObjectKind, scale: number): Partial<CanvasObject> {
  const factor = creationFactor(scale);
  if (factor === 1) return {};
  const style: Record<string, StyleValue> = {};
  Object.entries(STYLE_DEFAULTS[kind] ?? SHAPE_STYLE).forEach(([key, value]) => {
    style[key] = value * factor;
  });
  if (kind === "connector" || kind === "stroke") return { style };
  const [width, height] = kind === "sticky" ? [190, 170] : [160, 90];
  return { width: width * factor, height: height * factor, style };
}

/** Applies the parts of the view that follow zoom: the snapping grid and background dots. */
export function syncZoom(graph: Graph, element: HTMLElement) {
  const { scale, translate } = graph.view;
  graph.setGridSize(gridForScale(scale));
  // Dot spacing steps through powers of ten in world units, staying readable on screen.
  const worldSpacing = 10 ** Math.ceil(Math.log10(DOT_PIXELS / scale));
  const spacing = worldSpacing * scale;
  element.style.backgroundSize = `${spacing}px ${spacing}px`;
  element.style.backgroundPosition = `${(translate.x * scale) % spacing}px ${(translate.y * scale) % spacing}px`;
}
