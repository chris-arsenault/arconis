import { InternalEvent, type Cell } from "@maxgraph/core";
import { refreshInkView } from "./inkView";
import { closeInk, paintInk } from "./inkCommands";
import { effectiveAppearance } from "../document/appearance";
import { creationOffset } from "./zoom";
import { makeDrawing, returnToMarkup, fitDrawing } from "./drawingCommands";
import type { EditorController } from "./controller";
import { isMarkup } from "../document/ink";
import { inPolygon, pathDistance } from "../document/inkHit";
import type { Item, PathPoint } from "../document/types";
import {
  clearInk,
  fillInk,
  highlightObject,
  inkAction,
  recolorInk,
  type InkSettings,
} from "./inkCommands";

const DEFAULT: InkSettings = {
  mode: "pen",
  shape: "freehand",
  color: "#6554c0",
  width: 3,
  fill: "none",
  gradient: "none",
  gradientAngle: 0,
};
const KEY = "arconis-drawing-tools";

/** Graph-facing composition of drawing state and semantic commands; no shared document mirror. */
export class DrawingEditor {
  visible = true;
  activeSketch = "";
  settings: InkSettings = { ...DEFAULT };
  favorites: InkSettings[] = [
    DEFAULT,
    { ...DEFAULT, color: "#e64980", width: 6 },
    { ...DEFAULT, mode: "highlighter", color: "#ffcc00", width: 24 },
  ];
  recent: string[] = [];
  private instruments = {
    pen: { color: DEFAULT.color, width: 3 },
    highlighter: { color: "#ffcc00", width: 24 },
  };

  constructor(
    private editor: EditorController,
    private changed: () => void
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) {
        this.settings = { ...DEFAULT, ...saved.settings };
        this.favorites = saved.favorites ?? this.favorites;
        this.instruments = saved.instruments ?? this.instruments;
        this.recent = saved.recent ?? [];
      }
    } catch {
      /* Defaults remain usable when local preferences are unavailable. */
    }
    const selectable = editor.graph.isCellSelectable.bind(editor.graph);
    editor.graph.isCellSelectable = (cell) => selectable(cell) && this.selectable(cell);
    editor.graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.refresh());
  }

  private selectable(cell: Cell) {
    const item = this.editor.document.get(cell.id ?? "");
    if (!item) return true;
    if (item.inside && this.editor.document.get(item.inside)?.type === "sketch")
      return item.inside === this.activeSketch;
    if (isMarkup(item))
      return (
        this.visible &&
        (this.editor.graph.isCellSelected(cell) ||
          (this.editor.tool === "draw" && this.settings.mode === "lasso"))
      );
    return true;
  }
  refresh() {
    refreshInkView(
      this.editor.graph,
      this.editor.document,
      this.editor.tool === "draw" && this.settings.mode === "lasso",
      this.activeSketch
    );
  }

  update(values: Partial<InkSettings>) {
    const mode = values.mode;
    if (mode === "pen" || mode === "highlighter")
      Object.assign(this.settings, this.instruments[mode]);
    Object.assign(this.settings, values);
    if (this.settings.mode === "pen" || this.settings.mode === "highlighter")
      this.instruments[this.settings.mode] = {
        color: this.settings.color,
        width: this.settings.width,
      };
    if (values.color)
      this.recent = [values.color, ...this.recent.filter((color) => color !== values.color)].slice(
        0,
        8
      );
    localStorage.setItem(
      KEY,
      JSON.stringify({
        settings: this.settings,
        favorites: this.favorites,
        instruments: this.instruments,
        recent: this.recent,
      })
    );
    this.editor.setTool("draw");
    this.changed();
  }

  favorite(index: number, save: boolean) {
    if (save) this.favorites[index] = { ...this.settings };
    this.update(save ? {} : this.favorites[index]);
  }

  toggle() {
    this.visible = !this.visible;
    this.editor.graph.clearSelection();
    this.changed();
  }
  make(blank = false) {
    const { scale, translate } = this.editor.graph.view;
    const id = makeDrawing(
      this.editor.document,
      blank ? [] : this.editor.selected(),
      {
        x: this.editor.element.clientWidth / 2 / scale - translate.x,
        y: this.editor.element.clientHeight / 2 / scale - translate.y,
      },
      scale
    );
    this.activeSketch = id;
    this.editor.setTool("draw");
    this.update({ mode: "pen", shape: "freehand" });
    this.changed();
  }
  enter(id: string) {
    const item = this.editor.document.get(id);
    const sketch = item?.type === "sketch" ? item : this.editor.document.get(item?.inside ?? "");
    if (sketch?.type !== "sketch") return false;
    this.activeSketch = sketch.id;
    this.editor.graph.clearSelection();
    this.update({ mode: "pen" });
    return true;
  }
  leave() {
    this.activeSketch = "";
    this.changed();
  }
  fit() {
    const sketch =
      this.editor.document.get(this.activeSketch) ??
      this.editor.selected().find((item) => item.type === "sketch");
    if (sketch) fitDrawing(this.editor.document, sketch);
  }
  demote() {
    const sketch =
      this.editor.document.get(this.activeSketch) ??
      this.editor.selected().find((item) => item.type === "sketch");
    if (!sketch) return;
    this.activeSketch = "";
    returnToMarkup(this.editor.document, sketch);
    this.changed();
  }
  clear() {
    clearInk(this.editor.document);
  }
  recolor() {
    recolorInk(this.editor.document, this.editor.selected(), this.settings.color);
  }
  close() {
    closeInk(this.editor.document, this.editor.selected());
  }
  fill() {
    paintInk(this.editor.document, this.editor.selected(), this.settings);
  }

  candidates() {
    return this.editor.document
      .list()
      .filter(
        (item) =>
          item.type === "drawing" &&
          (this.activeSketch ? item.inside === this.activeSketch : isMarkup(item))
      );
  }

  hit(point: PathPoint): Item | undefined {
    const radius = this.radius();
    return [...this.candidates()]
      .reverse()
      .find(
        (item) =>
          pathDistance(point, item.points) <= radius ||
          (item.look.closed && inPolygon(point, item.points))
      );
  }
  radius(extra = 6) {
    const scale = this.editor.graph.view.scale;
    return (this.settings.width * creationOffset(scale)) / 2 + extra / scale;
  }

  click(point: PathPoint, target?: string) {
    const canvas = this.editor.document,
      { mode } = this.settings;
    if (mode === "highlight" && target) return highlightObject(canvas, target, this.settings.color);
    const item = this.hit(point) ?? (target ? canvas.get(target) : undefined);
    if (!item) return;
    if (mode === "eraser") inkAction(canvas, () => canvas.remove([item.id]));
    if (mode === "fill") fillInk(canvas, item, this.settings);
    if (mode === "eyedropper") {
      const appearance = effectiveAppearance(item, canvas.namedStyle(item.style));
      this.update({ color: appearance.fill !== "none" ? appearance.fill : appearance.line });
    }
  }

  lasso(points: PathPoint[], append: boolean) {
    const ids = this.candidates()
      .filter((item) => item.points.some((point) => inPolygon(point, points)))
      .map((item) => item.id);
    const model = this.editor.graph.getDataModel();
    const cells = ids.map((id) => model.getCell(id)).filter((cell) => cell !== null);
    if (append) this.editor.graph.addSelectionCells(cells);
    else this.editor.graph.setSelectionCells(cells);
    this.editor.setTool("select");
  }
}
