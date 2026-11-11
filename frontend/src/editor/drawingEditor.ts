import {
  InternalEvent,
  type Cell,
  type ConnectionHandler,
  type SelectionCellsHandler,
} from "@maxgraph/core";
import { refreshInkView } from "./inkView";
import { effectiveAppearance } from "../document/appearance";
import { creationOffset } from "./zoom";
import type { EditorController } from "./controller";
import { highlighted, isMarkup } from "../document/ink";
import { visibleItems } from "../document/relations";
import { layerOf, hiddenByLayers } from "../document/layers";
import { inPolygon, pathDistance } from "../document/inkHit";
import type { Item, PathPoint } from "../document/types";
import {
  addInk,
  clearInk,
  closeInk,
  fillInk,
  highlightObject,
  type InkSettings,
} from "./inkCommands";
import { DrawingPreferences, DRAWING_PREFERENCES_KEY } from "./drawingPreferences";
import { DRAWING_TOOLS, isInkTool, type DrawingTool, type InkTarget } from "./drawingTools";
import {
  MarkupPreferences,
  MARKUP_PREFERENCES_KEY,
  type MarkupSize,
  type MarkupTool,
} from "./markupPreferences";
import { changeInkStyle } from "./inkStyle";
import { transferInk } from "./inkTransfer";

function savedPreferences(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null; /* Local preferences are optional. */
  }
}

function savePreferences(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Tools remain usable without local storage. */
  }
}

/**
 * Draw and Markup share the ink gestures and nothing else: each keeps its own remembered tools,
 * and the armed tool supplies both the destination and the settings a gesture paints with.
 */
export class DrawingEditor {
  visible = true;
  destination: InkTarget = "markup";
  private preferences = new DrawingPreferences(savedPreferences(DRAWING_PREFERENCES_KEY));
  private markupPreferences = new MarkupPreferences(savedPreferences(MARKUP_PREFERENCES_KEY));
  /** What the next gesture paints with: Markup's settings under Markup, the brush under Draw. */
  get settings() {
    return this.markup ? this.markupPreferences.settings : this.preferences.settings;
  }
  /** The pointer's cursor for the armed tool, Markup's or Draw's. */
  get cursor() {
    return this.markup
      ? this.markupPreferences.cursor
      : DRAWING_TOOLS[this.preferences.tool].cursor;
  }
  /** The Draw brush, whichever tool is armed: what the Draw panel shows and edits. */
  get brush() {
    return this.preferences.settings;
  }
  get brushTool() {
    return this.preferences.tool;
  }
  /** Markup's remembered tool, colour and size: what the Markup bar shows and edits. */
  get markupChoice(): Readonly<{ tool: MarkupTool; color: string; size: MarkupSize }> {
    return this.markupPreferences;
  }
  get favorites() {
    return this.preferences.favorites;
  }
  get recent() {
    return this.preferences.recent;
  }
  get active() {
    return isInkTool(this.editor.tool);
  }
  get markup() {
    return this.destination === "markup";
  }
  setDestination(tool: string) {
    if (!isInkTool(tool)) return;
    if (this.destination !== tool) this.gestureVersion++;
    this.destination = tool;
  }
  colorTarget: "color" | "fill" = "color";
  gestureVersion = 0;
  private drawing = false;

  constructor(
    private editor: EditorController,
    private changed: () => void
  ) {
    const selectable = editor.graph.isCellSelectable.bind(editor.graph);
    editor.graph.isCellSelectable = (cell) => selectable(cell) && this.selectable(cell);
    const handles = editor.graph.getPlugin<SelectionCellsHandler>("SelectionCellsHandler");
    if (handles) {
      const selected = handles.getHandledSelectionCells.bind(handles);
      handles.getHandledSelectionCells = () => (editor.tool === "select" ? selected() : []);
    }
    editor.graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.refresh());
  }
  private selectable(cell: Cell) {
    const item = this.editor.document.get(cell.id ?? "");
    return (
      !item ||
      !isMarkup(item) ||
      (this.visible &&
        (this.editor.graph.isCellSelected(cell) ||
          (this.active && this.markup && this.settings.mode === "lasso")))
    );
  }
  refresh() {
    if (this.active !== this.drawing) {
      this.drawing = this.active;
      const graph = this.editor.graph;
      graph.setConnectable(!this.drawing);
      const connection = graph.getPlugin<ConnectionHandler>("ConnectionHandler");
      connection?.constraintHandler.setEnabled(!this.drawing);
      connection?.reset();
    }
    this.editor.graph.getPlugin<SelectionCellsHandler>("SelectionCellsHandler")?.refresh();
    refreshInkView(
      this.editor.graph,
      this.editor.document,
      this.active && this.markup && this.settings.mode === "lasso"
    );
  }
  update(values: Partial<InkSettings>) {
    if (values.mode || values.shape) this.gestureVersion++;
    this.preferences.update(values);
    this.arm();
  }
  activate(tool: DrawingTool) {
    this.gestureVersion++;
    this.preferences.choose(tool);
    this.arm();
  }
  /** Changing a brush is a decision to draw, so it arms Draw. */
  private arm() {
    savePreferences(DRAWING_PREFERENCES_KEY, this.preferences.serialize());
    this.editor.setTool("draw");
    this.changed();
  }
  /** Changing Markup's tool, colour or size arms Markup and leaves the Draw brush alone. */
  chooseMarkup(choice: Partial<{ tool: MarkupTool; color: string; size: MarkupSize }>) {
    this.gestureVersion++;
    Object.assign(this.markupPreferences, choice);
    savePreferences(MARKUP_PREFERENCES_KEY, this.markupPreferences.serialize());
    this.editor.setTool("markup");
    this.changed();
  }
  style(values: Partial<InkSettings>) {
    changeInkStyle(this.editor.document, this.editor.selected(), values);
  }
  favorite(index: number, save: boolean) {
    if (save) this.favorites[index] = { ...this.settings };
    this.update(save ? {} : this.favorites[index]);
  }
  toggle() {
    this.visible = !this.visible;
    this.editor.graph.clearSelection();
    this.editor.graph.view.revalidate();
    this.changed();
  }
  clear() {
    clearInk(this.editor.document);
  }
  close() {
    closeInk(this.editor.document, this.editor.selected());
  }
  transfer(markup: boolean) {
    if (
      !transferInk(this.editor.document, this.editor.selected(), markup, this.editor.layers.active)
    )
      this.editor.room?.setNotice("Disconnect the selected ink before moving it to Markup.");
  }
  create(points: PathPoint[]) {
    return addInk(
      this.editor.document,
      points,
      this.settings,
      this.markup,
      this.editor.graph.view.scale
    );
  }
  candidates(allLayers = false, outlines = false) {
    const document = this.editor.document,
      items = document.list();
    const byId = new Map(items.map((item) => [item.id, item]));
    const hidden = hiddenByLayers(items, this.editor.layers.hidden, document.layerList());
    return visibleItems(items)
      .filter((item) => !isMarkup(item) || this.visible)
      .filter(
        (item) =>
          (item.type === "drawing" || (outlines && item.type === "highlight")) &&
          !item.locked &&
          !hidden.has(item.id) &&
          (allLayers ||
            (this.markup
              ? this.visible && isMarkup(item)
              : !isMarkup(item) && layerOf(item, byId) === this.editor.layers.active))
      );
  }
  hit(point: PathPoint, sampling = false): Item | undefined {
    const radius = this.radius();
    return [...this.candidates(sampling)]
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
    if (mode === "highlight" && target)
      return highlightObject(canvas, target, this.settings, this.markup);
    const item =
      this.hit(point, mode === "eyedropper") ??
      (mode === "eyedropper" && target ? canvas.get(target) : undefined);
    if (!item) return;
    if (mode === "fill") fillInk(canvas, item, this.settings);
    if (mode === "eyedropper") {
      const appearance = effectiveAppearance(item, canvas.namedStyle(item.style));
      this.preferences.choose(this.preferences.sampleTool);
      this.update({
        [this.colorTarget]: this.colorTarget === "fill" ? appearance.fill : appearance.line,
      });
    }
  }
  lasso(points: PathPoint[], append: boolean) {
    const items = new Map(this.editor.document.list().map((item) => [item.id, item]));
    const ids = this.candidates(false, true)
      .filter((item) => selectionPoints(item, items).some((point) => inPolygon(point, points)))
      .map((item) => item.id);
    const model = this.editor.graph.getDataModel();
    const cells = ids.map((id) => model.getCell(id)).filter((cell) => cell !== null);
    if (append) this.editor.graph.addSelectionCells(cells);
    else this.editor.graph.setSelectionCells(cells);
    this.editor.setTool("select");
  }
}

function selectionPoints(item: Item, items: Map<string, Item>): PathPoint[] {
  if (item.type !== "highlight") return item.points;
  const { x, y, width, height } = highlighted(item, items);
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}
