import { z } from "zod";
import type { InkSettings } from "./inkCommands";
import type { DrawingCursor } from "./drawingTools";
import { DEFAULT_BRUSH } from "./drawingPreferences";

export const MARKUP_PREFERENCES_KEY = "arconis-markup-tools";

export type MarkupTool =
  | "pen"
  | "marker"
  | "arrow"
  | "box"
  | "bracket"
  | "brace"
  | "cloud"
  | "outline"
  | "eraser"
  | "select";
export type MarkupSize = "small" | "medium" | "large";
interface MarkupToolSpec {
  label: string;
  hint: string;
  cursor: DrawingCursor;
  mode: InkSettings["mode"];
  shape: InkSettings["shape"];
  /** Stroke width for each size; tools without paint have none. */
  widths: Record<MarkupSize, number> | null;
  opacity: number;
}
const PEN_WIDTHS = { small: 2, medium: 4, large: 8 };

/** A review shape dragged across its bounds, in Markup's one colour and size. */
function reviewShape(label: string, hint: string, shape: InkSettings["shape"]): MarkupToolSpec {
  return { label, hint, cursor: "crosshair", mode: "pen", shape, widths: PEN_WIDTHS, opacity: 100 };
}

/** Markup is a fixed set of review marks: enough to point at a diagram, not to compose artwork. */
export const MARKUP_TOOLS = {
  pen: {
    label: "Pen",
    hint: "Drag to write or sketch over the canvas.",
    cursor: "pen",
    mode: "pen",
    shape: "freehand",
    widths: PEN_WIDTHS,
    opacity: 100,
  },
  marker: {
    label: "Marker",
    hint: "Drag to highlight with translucent ink.",
    cursor: "marker",
    mode: "highlighter",
    shape: "freehand",
    widths: { small: 12, medium: 24, large: 36 },
    opacity: 30,
  },
  arrow: reviewShape("Arrow", "Drag from where the arrow starts to what it points at.", "arrow"),
  box: reviewShape("Box", "Drag across an area to frame it.", "rectangle"),
  bracket: reviewShape("Bracket", "Drag across what the bracket should span.", "bracket"),
  brace: reviewShape("Brace", "Drag across what the brace should span.", "brace"),
  cloud: reviewShape("Revision cloud", "Drag across an area to cloud it for revision.", "cloud"),
  outline: {
    label: "Outline object",
    hint: "Click an object to toggle an outline that follows it.",
    cursor: "target",
    mode: "highlight",
    shape: "freehand",
    widths: PEN_WIDTHS,
    opacity: 100,
  },
  eraser: {
    label: "Erase",
    hint: "Click or sweep across annotations to remove them.",
    cursor: "eraser",
    mode: "eraser",
    shape: "freehand",
    widths: { small: 8, medium: 16, large: 32 },
    opacity: 100,
  },
  select: {
    label: "Select annotations",
    hint: "Drag around annotations to move, restyle or keep them. Hold Shift to add.",
    cursor: "lasso",
    mode: "lasso",
    shape: "freehand",
    widths: null,
    opacity: 100,
  },
} satisfies Record<MarkupTool, MarkupToolSpec>;

export const MARKUP_COLORS = [
  { color: "#e03131", name: "Red" },
  { color: "#f08c00", name: "Orange" },
  { color: "#ffcc00", name: "Yellow" },
  { color: "#2f9e44", name: "Green" },
  { color: "#1971c2", name: "Blue" },
  { color: "#212529", name: "Black" },
];
export const MARKUP_SIZES: { id: MarkupSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const schema = z
  .object({
    tool: z.enum(Object.keys(MARKUP_TOOLS) as [MarkupTool, ...MarkupTool[]]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    size: z.enum(["small", "medium", "large"]),
  })
  .partial();

/**
 * Markup's own remembered tool, colour and size, kept apart from the Draw brushes so a review
 * pen never changes an artist's brush. One colour and one size apply to every markup tool.
 */
export class MarkupPreferences {
  tool: MarkupTool = "pen";
  color = MARKUP_COLORS[0].color;
  size: MarkupSize = "medium";

  constructor(saved: unknown = null) {
    const parsed = schema.safeParse(saved);
    if (parsed.success) Object.assign(this, parsed.data);
  }

  /** The ink settings the shared drawing gestures paint with. */
  get settings(): InkSettings {
    const spec: MarkupToolSpec = MARKUP_TOOLS[this.tool];
    return {
      ...DEFAULT_BRUSH,
      mode: spec.mode,
      shape: spec.shape,
      color: this.color,
      width: spec.widths?.[this.size] ?? DEFAULT_BRUSH.width,
      opacity: spec.opacity,
    };
  }

  get cursor(): DrawingCursor {
    return MARKUP_TOOLS[this.tool].cursor;
  }

  serialize() {
    return { tool: this.tool, color: this.color, size: this.size };
  }
}
