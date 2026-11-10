import type { DrawingCursor } from "./drawingTools";
import type { Tool } from "./shapes";

export type CursorName = DrawingCursor | "default" | "grab" | "grabbing" | "text" | "link";
export interface CursorSpec {
  css: string;
  hotspot: readonly [number, number] | null;
  asset: string | null;
}
function native(css: string): CursorSpec {
  return { css, hotspot: null, asset: null };
}

/** White backing and a dark edge keep the actual contact point legible on either canvas theme. */
function icon(path: string, hotspot: readonly [number, number]): CursorSpec {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" stroke="white" stroke-width="4.5"/><path d="${path}" stroke="#161923" stroke-width="1.6"/></g></svg>`;
  const asset = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { asset, hotspot, css: `url("${asset}") ${hotspot[0]} ${hotspot[1]}, crosshair` };
}

export const CURSORS: Record<CursorName, CursorSpec> = {
  default: native("default"),
  grab: native("grab"),
  grabbing: native("grabbing"),
  text: native("text"),
  crosshair: native("crosshair"),
  target: native("crosshair"),
  pen: icon("M3 24 5 16 19 2 25 8 11 22 3 24M5 16 11 22M16 5 22 11", [3, 24]),
  marker: icon("M3 24 7 19 5 17 17 3 25 11 13 23 11 21 6 25 3 24M7 15 15 23", [3, 24]),
  eraser: icon("M4 20 16 5 25 13 15 25 9 25 4 20M10 13 20 21M15 25 25 25", [4, 20]),
  lasso: icon("M4 4h6M7 1v6M8 9C3 13 3 23 13 24c12 1 13-15 3-16M13 24c-3 3-7 2-7 0", [7, 4]),
  fill: icon(
    "M4 20 16 8 25 17 14 26 4 20M12 5 21 14M7 18h16M4 20c0 0-3 3-3 5 0 2 4 2 4 0",
    [4, 20]
  ),
  picker: icon("M3 24 5 17 17 5 23 11 11 23 3 24M15 7 19 3 25 9 21 13M5 17 11 23", [3, 24]),
  link: icon(
    "M7 15 4 18a5 5 0 0 0 7 7l5-5a5 5 0 0 0 0-7M14 14l-2 2M14 10l5-5a5 5 0 0 1 7 7l-4 4",
    [12, 16]
  ),
};

/** Exhaustive placement/navigation coverage: adding a Tool requires choosing its cursor here. */
export const TOOL_CURSORS: Record<Exclude<Tool, "draw" | "markup">, CursorName> = {
  select: "default",
  measure: "crosshair",
  pan: "grab",
  connect: "link",
  text: "text",
  note: "crosshair",
  frame: "crosshair",
  slide: "crosshair",
  rectangle: "crosshair",
  ellipse: "crosshair",
  decision: "crosshair",
  service: "crosshair",
  database: "crosshair",
  cloud: "crosshair",
  person: "crosshair",
  icon: "crosshair",
  junction: "crosshair",
};
