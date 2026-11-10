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
import { isInkTool, type DrawingFamily, type DrawingTool, type InkTarget } from "./drawingTools";
import { changeInkStyle } from "./inkStyle";
import { transferInk } from "./inkTransfer";

/** The two authoring tools share brushes; the selected tool supplies the destination. */
export class DrawingEditor {
  visible = true;
  destination: InkTarget = "markup";
  private preferences = new DrawingPreferences();
  get settings() {
    return this.preferences.settings;
  }
  get favorites() {
    return this.preferences.favorites;
  }
  get recent() {
    return this.preferences.recent;
  }
  get tool() {
    return this.preferences.tool;
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
    try {
      this.preferences = new DrawingPreferences(
        JSON.parse(localStorage.getItem(DRAWING_PREFERENCES_KEY) ?? "null")
      );
    } catch {
      /* Local preferences are optional. */
    }
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
  family(family: DrawingFamily) {
    this.gestureVersion++;
    this.preferences.family(family);
    this.arm();
  }
  private arm() {
    try {
      localStorage.setItem(DRAWING_PREFERENCES_KEY, JSON.stringify(this.preferences.serialize()));
    } catch {
      /* Brushes remain usable without local storage. */
    }
    this.editor.setTool(this.destination);
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
