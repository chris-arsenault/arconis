import type { InkSettings } from "./inkCommands";
import type { InkKind } from "../document/types";

export type InkTarget = "draw" | "markup";
export const isInkTool = (tool: string): tool is InkTarget => tool === "draw" || tool === "markup";

export type DrawingTool =
  "freehand" | "vector" | "lasso" | "eraser" | "precision" | "fill" | "eyedropper";
export type DrawingCursor =
  "pen" | "marker" | "target" | "crosshair" | "lasso" | "eraser" | "fill" | "picker";
interface DrawingToolSpec {
  label: string;
  hint: string;
  /** A tool that makes ink with the brush, rather than editing ink already there. */
  creates: boolean;
  mode: InkSettings["mode"];
  cursor: DrawingCursor;
}

/** The same tools and vocabulary drive the palette, commands, presets and cursors. */
export const DRAWING_TOOLS = {
  freehand: {
    label: "Freehand",
    hint: "Drag to draw a freehand stroke.",
    creates: true,
    mode: "pen",
    cursor: "pen",
  },
  vector: {
    label: "Vector",
    hint: "Drag to construct a shape. Hold Shift to constrain it.",
    creates: true,
    mode: "pen",
    cursor: "crosshair",
  },
  lasso: {
    label: "Select ink",
    hint: "Drag around whole paths. Hold Shift to add to the selection.",
    creates: false,
    mode: "lasso",
    cursor: "lasso",
  },
  eraser: {
    label: "Erase stroke",
    hint: "Click or sweep across paths to remove whole strokes.",
    creates: false,
    mode: "eraser",
    cursor: "eraser",
  },
  precision: {
    label: "Erase segment",
    hint: "Drag to cut away only the part of a path you touch.",
    creates: false,
    mode: "precision",
    cursor: "eraser",
  },
  fill: {
    label: "Fill path",
    hint: "Click a closed path to apply the Fill color.",
    creates: false,
    mode: "fill",
    cursor: "fill",
  },
  eyedropper: {
    label: "Pick color",
    hint: "Click to sample into the selected Stroke or Fill swatch.",
    creates: false,
    mode: "eyedropper",
    cursor: "picker",
  },
} satisfies Record<DrawingTool, DrawingToolSpec>;

export const DRAWING_CREATORS: DrawingTool[] = ["freehand", "vector"];
export const DRAWING_UTILITIES: DrawingTool[] = [
  "lasso",
  "eraser",
  "precision",
  "fill",
  "eyedropper",
];
/** The geometries Draw's Vector tool constructs. Review shapes belong to Markup. */
export const DRAWING_SHAPES: { id: Exclude<InkKind, "freehand">; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "double-arrow", label: "Double arrow" },
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "polygon", label: "Polygon" },
];

/** The Draw tool a brush belongs to: a brush that paints is Freehand or Vector by its geometry. */
export function drawingToolOf(settings: Pick<InkSettings, "mode" | "shape">): DrawingTool {
  if (settings.mode === "pen" || settings.mode === "highlighter" || settings.mode === "highlight")
    return settings.shape === "freehand" ? "freehand" : "vector";
  return settings.mode;
}
