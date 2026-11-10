import { z } from "zod";
import type { InkSettings } from "./inkCommands";
import { DRAWING_TOOLS, drawingToolOf, type DrawingFamily, type DrawingTool } from "./drawingTools";
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
    mode: z.enum([
      "pen",
      "highlighter",
      "highlight",
      "eraser",
      "lasso",
      "fill",
      "eyedropper",
      "precision",
    ]),
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
  const brush = { ...base, ...parsed.data };
  if (parsed.data.opacity === undefined)
    brush.opacity = brush.mode === "highlighter" ? 30 : base.opacity;
  return brush;
}

function initialBrush(tool: DrawingTool): InkSettings {
  const spec = DRAWING_TOOLS[tool];
  const shape = tool === "vector" || tool === "highlightShape" ? "rectangle" : "freehand";
  const marker = spec.mode === "highlighter";
  return {
    ...DEFAULT_BRUSH,
    mode: spec.mode,
    shape,
    color: marker ? "#ffcc00" : DEFAULT_BRUSH.color,
    width: marker ? 24 : 3,
    fill: tool === "fill" ? DEFAULT_BRUSH.color : "none",
    opacity: marker ? 30 : 100,
  };
}

/** Local tool preferences only. Saved documents retain the existing canonical path representation. */
export class DrawingPreferences {
  tool: DrawingTool = "freehand";
  settings: InkSettings = { ...DEFAULT_BRUSH };
  favorites = [
    DEFAULT_BRUSH,
    { ...DEFAULT_BRUSH, color: "#e64980", width: 6 },
    initialBrush("marker"),
  ];
  recent: string[] = [];
  sampleTool: DrawingTool = "freehand";
  readonly brushes = Object.fromEntries(
    (Object.keys(DRAWING_TOOLS) as DrawingTool[]).map((tool) => [tool, initialBrush(tool)])
  ) as Record<DrawingTool, InkSettings>;
  private familyTools: Record<DrawingFamily, DrawingTool> = {
    freehand: "freehand",
    highlight: "marker",
    vector: "vector",
  };

  constructor(saved: unknown = null) {
    if (!saved || typeof saved !== "object") return;
    const state = saved as Record<string, unknown>;
    this.restoreBrushes(state);
    this.restoreFamilies(state.familyTools);
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

  private restoreFamilies(saved: unknown) {
    if (!saved || typeof saved !== "object") return;
    for (const family of Object.keys(this.familyTools) as DrawingFamily[]) {
      const tool = (saved as Record<string, unknown>)[family];
      if (
        typeof tool === "string" &&
        tool in DRAWING_TOOLS &&
        DRAWING_TOOLS[tool as DrawingTool].family === family
      )
        this.familyTools[family] = tool as DrawingTool;
    }
  }

  private restoreSampleTool(tool: unknown) {
    if (
      typeof tool === "string" &&
      tool in DRAWING_TOOLS &&
      (DRAWING_TOOLS[tool as DrawingTool].family || tool === "fill")
    )
      this.sampleTool = tool as DrawingTool;
  }

  private restoreBrushes(state: Record<string, unknown>) {
    const saved = state.brushes as Partial<Record<DrawingTool, unknown>> | undefined;
    for (const tool of Object.keys(this.brushes) as DrawingTool[])
      if (saved?.[tool]) this.brushes[tool] = readBrush(saved[tool], initialBrush(tool));
    const legacy = state.instruments as Record<string, unknown> | undefined;
    if (!saved && legacy) {
      this.brushes.freehand = readBrush(legacy.pen, initialBrush("freehand"));
      this.brushes.marker = readBrush(legacy.highlighter, initialBrush("marker"));
    }
  }

  choose(tool: DrawingTool) {
    if (DRAWING_TOOLS[this.tool].family || this.tool === "fill") this.sampleTool = this.tool;
    this.brushes[this.tool] = { ...this.settings };
    this.tool = tool;
    this.settings = { ...this.brushes[tool] };
    this.settings.mode = DRAWING_TOOLS[tool].mode;
    if (tool === "freehand" || tool === "marker") this.settings.shape = "freehand";
    if ((tool === "vector" || tool === "highlightShape") && this.settings.shape === "freehand")
      this.settings.shape = "rectangle";
    const family = DRAWING_TOOLS[tool].family;
    if (family) this.familyTools[family] = tool;
  }
  family(family: DrawingFamily) {
    this.choose(this.familyTools[family]);
  }

  update(values: Partial<InkSettings>) {
    if (values.mode || values.shape) {
      const tool = drawingToolOf({ ...this.settings, ...values });
      if (tool !== this.tool) this.choose(tool);
    }
    Object.assign(this.settings, values);
    this.brushes[this.tool] = { ...this.settings };
    const family = DRAWING_TOOLS[this.tool].family;
    if (family) this.familyTools[family] = this.tool;
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
      familyTools: this.familyTools,
      sampleTool: this.sampleTool,
    };
  }
}
