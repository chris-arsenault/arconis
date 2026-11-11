import { z } from "zod";
import type { InkSettings } from "./inkCommands";
import { DRAWING_TOOLS, drawingToolOf, type DrawingTool } from "./drawingTools";
import { INK_KINDS } from "../document/ink";

export const DRAWING_PREFERENCES_KEY = "arconis-drawing-tools";
export const DEFAULT_BRUSH: InkSettings = {
  mode: "pen",
  shape: "freehand",
  color: "#6554c0",
  width: 3,
  fill: "none",
  gradient: "none",
  gradientAngle: 0,
  opacity: 100,
};
const color = z.string().regex(/^(#[0-9a-f]{6}|none)$/i);
const brushSchema = z
  .object({
    mode: z.enum(["pen", "eraser", "lasso", "fill", "eyedropper", "precision"]),
    shape: z.enum(INK_KINDS),
    color,
    width: z.number().positive(),
    fill: color,
    gradient: color,
    gradientAngle: z.number(),
    opacity: z.number().min(0).max(100),
  })
  .partial();

export function readBrush(value: unknown, base = DEFAULT_BRUSH): InkSettings {
  const parsed = brushSchema.safeParse(value);
  if (!parsed.success) return { ...base };
  return { ...base, ...parsed.data };
}

function initialBrush(tool: DrawingTool): InkSettings {
  return {
    ...DEFAULT_BRUSH,
    mode: DRAWING_TOOLS[tool].mode,
    shape: tool === "vector" ? "rectangle" : "freehand",
    fill: tool === "fill" ? DEFAULT_BRUSH.color : "none",
  };
}

/** Local tool preferences only. Saved documents retain the existing canonical path representation. */
export class DrawingPreferences {
  tool: DrawingTool = "freehand";
  settings: InkSettings = { ...DEFAULT_BRUSH };
  favorites = [
    DEFAULT_BRUSH,
    { ...DEFAULT_BRUSH, color: "#e64980", width: 6 },
    { ...DEFAULT_BRUSH, color: "#ffcc00", width: 24, opacity: 30 },
  ];
  recent: string[] = [];
  sampleTool: DrawingTool = "freehand";
  readonly brushes = Object.fromEntries(
    (Object.keys(DRAWING_TOOLS) as DrawingTool[]).map((tool) => [tool, initialBrush(tool)])
  ) as Record<DrawingTool, InkSettings>;

  constructor(saved: unknown = null) {
    if (!saved || typeof saved !== "object") return;
    const state = saved as Record<string, unknown>;
    this.restoreBrushes(state);
    this.settings = { ...this.brushes.freehand };
    if (Array.isArray(state.favorites))
      this.favorites = state.favorites.map((brush) => readBrush(brush));
    if (Array.isArray(state.recent))
      this.recent = state.recent
        .filter(
          (entry): entry is string => typeof entry === "string" && color.safeParse(entry).success
        )
        .slice(0, 8);
    this.update(readBrush(state.settings));
    this.restoreSampleTool(state.sampleTool);
  }

  private restoreSampleTool(tool: unknown) {
    if (
      typeof tool === "string" &&
      tool in DRAWING_TOOLS &&
      (DRAWING_TOOLS[tool as DrawingTool].creates || tool === "fill")
    )
      this.sampleTool = tool as DrawingTool;
  }

  private restoreBrushes(state: Record<string, unknown>) {
    const saved = state.brushes as Partial<Record<DrawingTool, unknown>> | undefined;
    for (const tool of Object.keys(this.brushes) as DrawingTool[])
      if (saved?.[tool]) this.brushes[tool] = readBrush(saved[tool], initialBrush(tool));
  }

  choose(tool: DrawingTool) {
    if (DRAWING_TOOLS[this.tool].creates || this.tool === "fill") this.sampleTool = this.tool;
    this.brushes[this.tool] = { ...this.settings };
    this.tool = tool;
    this.settings = { ...this.brushes[tool] };
    this.settings.mode = DRAWING_TOOLS[tool].mode;
    if (tool === "freehand") this.settings.shape = "freehand";
    if (tool === "vector" && this.settings.shape === "freehand") this.settings.shape = "rectangle";
  }

  update(values: Partial<InkSettings>) {
    if (values.mode || values.shape) {
      const tool = drawingToolOf({ ...this.settings, ...values });
      if (tool !== this.tool) this.choose(tool);
    }
    Object.assign(this.settings, values);
    this.brushes[this.tool] = { ...this.settings };
    if (values.color)
      this.recent = [values.color, ...this.recent.filter((entry) => entry !== values.color)].slice(
        0,
        8
      );
  }
  serialize() {
    return {
      settings: this.settings,
      brushes: this.brushes,
      favorites: this.favorites,
      recent: this.recent,
      sampleTool: this.sampleTool,
    };
  }
}
