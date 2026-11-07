import type { Graph } from "@maxgraph/core";
import type { CanvasObject, ObjectKind, StyleValue } from "../document/types";

export const MIN_SCALE = 0.001;
export const MAX_SCALE = 1000;
const GRID_PIXELS = 10;
/** Close enough to show snap points at 100%, and not so close that lines become a solid tint. */
const LINE_PIXELS = 8;
const MAJOR_LINE_EVERY = 10;

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
  panel: { fontSize: 13, strokeWidth: 1, startSize: 28 },
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
  const sizes: Partial<Record<ObjectKind, [number, number]>> = {
    sticky: [190, 170],
    icon: [64, 64],
    panel: [320, 220],
  };
  const [width, height] = sizes[kind] ?? [160, 90];
  return { width: width * factor, height: height * factor, style };
}

/** Applies the parts of the view that follow zoom: the snapping grid and its visible lines. */
export function syncZoom(graph: Graph, element: HTMLElement) {
  const { scale, translate } = graph.view;
  graph.setGridSize(gridForScale(scale));
  // Line spacing steps through powers of ten in world units, staying readable on screen. The first
  // two background layers are major lines and the last two minor, as `.canvas-surface` declares.
  const minor = 10 ** Math.ceil(Math.log10(LINE_PIXELS / scale)) * scale;
  const major = minor * MAJOR_LINE_EVERY;
  const size = (spacing: number) => `${spacing}px ${spacing}px`;
  const position = (spacing: number) =>
    `${(translate.x * scale) % spacing}px ${(translate.y * scale) % spacing}px`;
  element.style.backgroundSize = [major, major, minor, minor].map(size).join(",");
  element.style.backgroundPosition = [major, major, minor, minor].map(position).join(",");
}
