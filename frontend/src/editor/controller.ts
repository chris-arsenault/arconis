import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  PanningHandler,
  VertexHandlerConfig,
  type ConnectionHandler,
} from "@maxgraph/core";
import { CanvasDocument } from "../document/canvasDocument";
import { LOCAL, isBox, isFrame, isLink, type Item, type ItemType } from "../document/types";
import { defaultName, newItemSize, shapeItem, type Shape, type Tool } from "./shapes";
import { projectDocument } from "./projection";
import { commitGraph } from "./graphChanges";
import { bindCanvasInput } from "./input";
import { previewBoxes, type PreviewBox } from "./preview";
import { configureRendering } from "./rendering";
import { keepArranged } from "./arrangements";
import { configureConnectionPoints } from "./connectionPoints";
import { clampScale, creationOffset, creationValues, syncZoom } from "./zoom";
import { configureCulling } from "./culling";
import { LabelMarks } from "./marks";
import { duplicateSelection, groupSelection, ungroupSelection } from "./composition";
import { configureComposition, endpointFor, syncLineAnchors } from "./topics";
import type { ScreenSize } from "../document/screens";
import { newSlideValues } from "../document/slides";
import { fitContents } from "./views";
import { subscribeIcons } from "./icons";
import { subscribePictures } from "./pictureSource";
import { configurePanels, containerAt } from "./panels";
import { compareStacking } from "../document/geometry";
import { newId } from "../document/ids";
import { transformObjects, type SelectionTransform } from "../document/transform";
import { CanvasGrid } from "./grid";
import { editorStage, Presenter } from "./presenter";
import { RateLimitedWrite } from "./rateLimitedWrite";

/** How often a selection-frame gesture writes to the document, and so reaches peers. */
const TRANSFORM_WRITE_MS = 100;

export type { Shape, Tool } from "./shapes";

export class EditorController {
  readonly graph: Graph;
  tool: Tool = "select";
  editId: string | null = null;
  selectOnEdit = false;
  armedIcon: { key: string; title: string } | null = null;
  armedScreen: ScreenSize | null = null;
  referencesVisible = false;
  connectionSource = "";
  /** The deck the last slide placed here joined, which the next one joins too. */
  lastDeck = "";
  version = 0;
  /** Receives in-progress move and resize boxes so peers can see a drag before it lands. */
  onPreview: (boxes: PreviewBox[] | null) => void = () => {};
  private projecting = false;
  private committing = false;
  private committed = false;
  private destroyed = false;
  private previewing = false;
  private transformWrites = new RateLimitedWrite(TRANSFORM_WRITE_MS);
  private lastPreview = 0;
  private listeners = new Set<() => void>();
  private cleanupInput: () => void;
  private cleanupIcons: () => void;
  private band: RubberBandHandler;

  readonly grid: CanvasGrid;
  /** This person's presentation of a deck, when one is running. */
  readonly presenter: Presenter;
  private marks: LabelMarks;
  constructor(
    readonly element: HTMLDivElement,
    readonly document: CanvasDocument
  ) {
    InternalEvent.disableContextMenu(element);
    VertexHandlerConfig.rotationEnabled = true;
    this.graph = new Graph(element);
    this.grid = new CanvasGrid(this.graph, element);
    this.presenter = new Presenter(
      editorStage(this.graph, element, document, {
        clear: () => this.clearEditing(),
        project: () => this.project(),
        emit: this.emit,
      })
    );
    this.graph.getDataModel().createId = () => newId((id) => this.document.items.has(id));
    this.graph.setPanning(true);
    this.graph.setConnectable(true);
    this.graph.setAllowDanglingEdges(false);
    this.graph.setCellsEditable(false);
    this.marks = new LabelMarks(this.graph, this.document);
    configureRendering(this.graph, (cell) => this.marks.text(cell));
    configureCulling(this.graph, () => this.referencesVisible);
    this.graph.isToggleEvent = (event) => event.shiftKey || event.ctrlKey || event.metaKey;
    this.graph.setDisconnectOnMove(false);
    this.graph.setDropEnabled(true);
    this.graph.setSplitEnabled(false);
    configureConnectionPoints(this.graph, this.document);
    configurePanels(this.graph, this.document);
    configureComposition(this.graph, this.document);
    this.graph.addMouseListener({
      mouseDown: () => {},
      mouseMove: () => this.publishPreview(),
      mouseUp: () => this.clearPreview(),
    });
    this.graph.getStylesheet().getDefaultEdgeStyle().edgeStyle = "orthogonalEdgeStyle";
    this.band = new RubberBandHandler(this.graph);
    // Alt moves a topic without its branches, so it cannot also force a marquee.
    this.band.isForceRubberbandEvent = () => false;
    this.graph.getDataModel().addListener(InternalEvent.CHANGE, this.onGraphChange);
    this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, this.emit);
    this.graph.view.addListener(InternalEvent.SCALE_AND_TRANSLATE, this.onView);
    this.graph.view.addListener(InternalEvent.SCALE, this.onView);
    this.graph.view.addListener(InternalEvent.TRANSLATE, this.onView);
    this.document.doc.on("update", this.onDocumentChange);
    this.document.undo.on("stack-item-added", this.emit);
    this.document.undo.on("stack-item-popped", this.emit);
    this.cleanupInput = bindCanvasInput(this);
    const stops = [
      subscribeIcons(() => this.project()),
      subscribePictures(() => this.project()),
      keepArranged(this.document),
    ];
    this.cleanupIcons = () => stops.forEach((stop) => stop());
    this.project();
    this.graph.view.setTranslate(60, 60);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.version;
  emit = () => {
    this.version++;
    this.listeners.forEach((listener) => listener());
  };
  private onView = () => {
    syncZoom(this.graph, this.element);
    this.emit();
  };
  private onDocumentChange = () => {
    if (this.committing) {
      this.committed = true;
      return;
    }
    this.project();
    this.emit();
  };
  private onGraphChange = () => {
    if (this.projecting) return;
    this.committing = true;
    try {
      commitGraph(this.graph, this.document);
      syncLineAnchors(this.graph, this.document);
    } finally {
      this.committing = false;
    }
    if (this.committed) {
      this.committed = false;
      // maxGraph queues edits made while it notifies listeners and never redraws them,
      // so the resulting projection runs once this model update has fully ended.
      queueMicrotask(() => {
        if (!this.destroyed) this.project();
        if (!this.destroyed) this.emit();
      });
    }
    this.emit();
  };
  /** World coordinates of a pointer event, free of the grid snap used for placing objects. */
  worldPoint(event: { clientX: number; clientY: number }) {
    const bounds = this.element.getBoundingClientRect();
    const { scale, translate } = this.graph.view;
    return {
      x: (event.clientX - bounds.left) / scale - translate.x,
      y: (event.clientY - bounds.top) / scale - translate.y,
    };
  }
  private publishPreview() {
    if (performance.now() - this.lastPreview < 80) return;
    const boxes = previewBoxes(this.graph);
    if (!boxes.length) return;
    this.lastPreview = performance.now();
    this.previewing = true;
    this.onPreview(boxes);
  }
  private clearPreview() {
    if (!this.previewing) return;
    this.previewing = false;
    this.onPreview(null);
  }
  private project() {
    this.projecting = true;
    try {
      projectDocument(this.graph, this.document, this.presenter.active);
    } finally {
      this.projecting = false;
    }
    this.marks.refresh();
  }

  armIcon(icon: { key: string; title: string }) {
    this.setTool("icon");
    this.armedIcon = icon;
    this.emit();
  }
  armScreen(screen: ScreenSize) {
    this.setTool("frame");
    this.armedScreen = screen;
    this.emit();
  }
  setTool(tool: Tool) {
    this.armedIcon = null;
    this.armedScreen = null;
    this.connectionSource = "";
    this.tool = tool;
    const pan = this.graph.getPlugin<PanningHandler>("PanningHandler");
    if (pan) {
      pan.useLeftButtonForPanning = tool === "pan";
      pan.ignoreCell = tool === "pan";
    }
    this.graph.setCellsMovable(tool === "select");
    this.element.dataset.tool = tool;
    this.emit();
  }

  add(shape: Shape, x?: number, y?: number, icon = this.armedIcon, screen = this.armedScreen) {
    const view = this.graph.view;
    const centerX = this.element.clientWidth / 2 / view.scale - view.translate.x;
    const centerY = this.element.clientHeight / 2 / view.scale - view.translate.y;
    const size = creationOffset(view.scale);
    const offset = (this.document.items.size % 6) * 16 * size;
    const left = x ?? centerX + (offset - 80) * size;
    const top = y ?? centerY + (offset - 45) * size;
    const { type, stencil } = shapeItem(shape);
    const slide = this.slideValues(type);
    const dimensions = newItemSize(shape, view.scale, screen, slide);
    const id = this.document.create(type, left, top, {
      name: screen?.name ?? icon?.title ?? defaultName(shape),
      inside: containerAt(this.document, left, top, dimensions),
      stencil,
      ...creationValues(type, view.scale, stencil),
      ...slide,
      ...dimensions,
      ...(icon ? { icon: icon.key } : {}),
    });
    this.select(id);
    this.setTool("select");
    return id;
  }

  /** A new slide's deck, number, place at the back and, in an existing deck, that deck's size. */
  private slideValues(type: ItemType): Partial<Item> {
    if (type !== "slide") return {};
    const values = newSlideValues(this.document.list(), this.selected(), this.lastDeck);
    this.lastDeck = values.deck ?? "";
    return values;
  }

  selected() {
    return this.graph
      .getSelectionCells()
      .map((cell) => this.document.get(cell.id!))
      .filter((item) => item !== null);
  }
  select(id: string, append = false) {
    const cell = this.graph.getDataModel().getCell(id);
    if (cell) {
      if (append) this.graph.addSelectionCell(cell);
      else this.graph.setSelectionCell(cell);
    }
    this.emit();
  }
  remove() {
    this.graph.removeCells();
    this.editId = null;
    this.emit();
  }
  edit(id: string, selectText = false) {
    this.editId = id;
    this.selectOnEdit = selectText;
    this.emit();
  }
  closeEditor() {
    this.editId = null;
    this.emit();
  }
  /** Leaves selection, inline editing and any armed tool behind, as Escape does. */
  clearEditing() {
    this.editId = null;
    this.graph.clearSelection();
    this.graph.getPlugin<ConnectionHandler>("ConnectionHandler")?.constraintHandler.reset();
    this.setTool("select");
  }
  /** Moves the selection above or below everything else in the room. */
  stack(direction: "front" | "back") {
    const selected = [...this.selected()].sort(compareStacking);
    if (!selected.length) return;
    const orders = this.document.list().map((item) => item.order);
    const base =
      direction === "front" ? Math.max(...orders) + 1 : Math.min(...orders) - selected.length;
    this.document.undo.stopCapturing();
    this.document.doc.transact(() => {
      selected.forEach((item, index) => this.document.patch(item.id, { order: base + index }));
    }, LOCAL);
    this.document.undo.stopCapturing();
  }
  /** Objects a collective transform changes: the selection, descendants and inner routes. */
  transformSnapshot() {
    return this.selectionClosure().map((id) => this.document.get(id)!);
  }
  beginTransform() {
    this.document.undo.stopCapturing();
    this.document.undo.captureTimeout = Number.MAX_SAFE_INTEGER;
  }
  /** Writes at a bounded rate, because each write rewrites every point of every drawing moved. */
  applyTransform(items: Item[], transform: SelectionTransform) {
    this.transformWrites.schedule(() => this.writeTransform(items, transform));
  }
  private writeTransform(items: Item[], transform: SelectionTransform) {
    const values = transformObjects(items, transform);
    this.document.doc.transact(() => {
      items.forEach((item) => {
        const { rotation, ...geometry } = values.get(item.id)!;
        this.document.patch(item.id, geometry);
        if (isBox(item) && !isFrame(item) && transform.angle)
          this.document.patchLook(item.id, { rotation });
      });
    }, LOCAL);
  }
  endTransform() {
    this.transformWrites.flush();
    this.document.undo.captureTimeout = 400;
    this.document.undo.stopCapturing();
  }
  updateGeometry(id: string, values: Partial<Pick<Item, "x" | "y" | "width" | "height">>) {
    const model = this.graph.getDataModel();
    const cell = model.getCell(id);
    if (!cell?.geometry) return;
    const origin = this.document.get(cell.parent?.id || "") || { x: 0, y: 0 };
    const geometry = cell.geometry.clone();
    if (values.x !== undefined) geometry.x = values.x - origin.x;
    if (values.y !== undefined) geometry.y = values.y - origin.y;
    if (values.width !== undefined) geometry.width = values.width;
    if (values.height !== undefined) geometry.height = values.height;
    model.setGeometry(cell, geometry);
  }
  group() {
    groupSelection(this);
  }
  ungroup() {
    ungroupSelection(this);
  }
  connect() {
    const selected = this.selected().filter((item) => item.type !== "drawing");
    if (selected.length !== 2) return;
    const [from, to] = selected.map((item) => endpointFor(this, item));
    if (from && to)
      this.document.create("line", 0, 0, {
        from,
        to,
        ...creationValues("line", this.graph.view.scale),
      });
  }
  duplicate() {
    duplicateSelection(this);
  }
  /** Shows or hides reference lines for this person. References always exist either way. */
  toggleReferences() {
    this.referencesVisible = !this.referencesVisible;
    this.graph.view.invalidate();
    this.graph.view.validate();
    this.emit();
  }
  selectionClosure() {
    const ids = new Set(this.selected().map((item) => item.id));
    const objects = this.document.list();
    let previousSize = -1;
    while (previousSize !== ids.size) {
      previousSize = ids.size;
      objects
        .filter((item) => ids.has(item.inside) || ids.has(item.onLine))
        .forEach((item) => ids.add(item.id));
    }
    objects
      .filter((item) => isLink(item) && ids.has(item.from) && ids.has(item.to))
      .forEach((item) => ids.add(item.id));
    return [...ids];
  }
  zoom(factor: number) {
    this.graph.zoomTo(clampScale(this.graph.view.scale * factor), true);
    this.emit();
  }
  fit() {
    fitContents(this.graph, this.element, this.document.list());
    this.emit();
  }
  destroy() {
    this.destroyed = true;
    this.cleanupIcons();
    this.cleanupInput();
    this.band.onDestroy();
    this.document.doc.off("update", this.onDocumentChange);
    this.document.undo.off("stack-item-added", this.emit);
    this.document.undo.off("stack-item-popped", this.emit);
    this.graph.destroy();
    this.listeners.clear();
  }
}
