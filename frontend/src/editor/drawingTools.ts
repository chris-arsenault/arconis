import type { InkSettings } from "./inkCommands";
import type { InkKind } from "../document/types";

export type InkTarget = "draw" | "markup";
export const isInkTool = (tool: string): tool is InkTarget => tool === "draw" || tool === "markup";

export type DrawingFamily = "freehand" | "highlight" | "vector";
export type DrawingTool =
  | "freehand"
  | "marker"
  | "highlightShape"
  | "outline"
  | "vector"
  | "lasso"
  | "eraser"
  | "precision"
  | "fill"
  | "eyedropper";
export type DrawingCursor =
  "pen" | "marker" | "target" | "crosshair" | "lasso" | "eraser" | "fill" | "picker";
interface DrawingToolSpec {
  label: string;
  hint: string;
  family: DrawingFamily | null;
  mode: InkSettings["mode"];
  cursor: DrawingCursor;
}

/** The same tools and vocabulary drive the palette, commands, presets and cursors. */
export const DRAWING_TOOLS = {
  freehand: {
    label: "Freehand",
    hint: "Drag to draw a freehand stroke.",
    family: "freehand",
    mode: "pen",
    cursor: "pen",
  },
  marker: {
    label: "Marker",
    hint: "Drag to highlight freely with translucent ink.",
    family: "highlight",
    mode: "highlighter",
    cursor: "marker",
  },
  highlightShape: {
    label: "Shaped highlight",
    hint: "Draw a translucent shape. Choose its geometry below.",
    family: "highlight",
    mode: "highlighter",
    cursor: "crosshair",
  },
  outline: {
    label: "Object outline",
    hint: "Click an object to toggle an outline that follows it.",
    family: "highlight",
    mode: "highlight",
    cursor: "target",
  },
  vector: {
    label: "Vector",
    hint: "Drag to construct a shape. Hold Shift to constrain it.",
    family: "vector",
    mode: "pen",
    cursor: "crosshair",
  },
  lasso: {
    label: "Select ink",
    hint: "Drag around whole paths. Hold Shift to add to the selection.",
    family: null,
    mode: "lasso",
    cursor: "lasso",
  },
  eraser: {
    label: "Erase stroke",
    hint: "Click or sweep across paths to remove whole strokes.",
    family: null,
    mode: "eraser",
    cursor: "eraser",
  },
  precision: {
    label: "Erase segment",
    hint: "Drag to cut away only the part of a path you touch.",
    family: null,
    mode: "precision",
    cursor: "eraser",
  },
  fill: {
    label: "Fill path",
    hint: "Click a closed path to apply the Fill color.",
    family: null,
    mode: "fill",
    cursor: "fill",
  },
  eyedropper: {
    label: "Pick color",
    hint: "Click to sample into the selected Stroke or Fill swatch.",
    family: null,
    mode: "eyedropper",
    cursor: "picker",
  },
} satisfies Record<DrawingTool, DrawingToolSpec>;

export const DRAWING_FAMILIES: { id: DrawingFamily; label: string }[] = [
  { id: "freehand", label: "Freehand" },
  { id: "highlight", label: "Highlight" },
  { id: "vector", label: "Vector" },
];
export const DRAWING_UTILITIES: DrawingTool[] = [
  "lasso",
  "eraser",
  "precision",
  "fill",
  "eyedropper",
];
export const DRAWING_SHAPES: { id: Exclude<InkKind, "freehand">; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "double-arrow", label: "Double arrow" },
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "polygon", label: "Polygon" },
  { id: "bracket", label: "Bracket" },
  { id: "brace", label: "Brace" },
  { id: "cloud", label: "Revision cloud" },
];

/** Legacy brushes already encode the intended tool in their mode and geometry. */
export function drawingToolOf(settings: Pick<InkSettings, "mode" | "shape">): DrawingTool {
  if (settings.mode === "pen") return settings.shape === "freehand" ? "freehand" : "vector";
  if (settings.mode === "highlighter")
    return settings.shape === "freehand" ? "marker" : "highlightShape";
  if (settings.mode === "highlight") return "outline";
  return settings.mode;
}
