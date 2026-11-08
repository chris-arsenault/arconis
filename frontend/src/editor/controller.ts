import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  PanningHandler,
  VertexHandlerConfig,
  type ConnectionHandler,
  type EventObject,
  type UndoableEdit,
} from "@maxgraph/core";
import { configureLocking } from "./locking";
import type { RoomSession } from "../collaboration/room";
import { CanvasDocument } from "../document/canvasDocument";
import type { Item, ItemType } from "../document/types";
import { defaultName, newItemSize, shapeItem, type Shape, type Tool } from "./shapes";
import { projectDocument } from "./projection";
import { commitGraph } from "./graphChanges";
import { bindCanvasInput } from "./input";
import { previewBoxes, type PreviewBox } from "./preview";
import { configureRendering } from "./rendering";
import { keepArranged } from "./arrangements";
import { configureConnectionPoints } from "./connectionPoints";
import { clampScale, creationOffset, creationValues, syncZoom, observeViewport } from "./zoom";
import { configureCulling } from "./culling";
import { LabelMarks } from "./marks";
import { duplicateSelection, groupSelection, ungroupSelection } from "./composition";
import { configureComposition, connectSelection, syncLineAnchors } from "./topics";
import type { ScreenSize } from "../document/screens";
import { newSlideValues } from "../document/slides";
import { fitContents } from "./views";
import { subscribeIcons } from "../assets/icons/catalog";
import { subscribePictures } from "./pictureSource";
import { configurePanels, containerAt } from "./panels";
import { newId } from "../document/ids";
import { stackSelection } from "./stacking";
import { trackViewHistory, type ViewHistory } from "./viewHistory";
import { initialUi, type EditorUi } from "./ui";
import { defaultFields } from "./styleClipboard";
import { updateCellGeometry } from "./geometryEdits";
import { EMPTY_FILTER, type Filter } from "./filter";
import { brightSet } from "./highlighting";
import type { SelectionTransform } from "../document/transform";
import { CanvasGrid } from "./grid";
import { editorStage, Presenter } from "./presenter";
import { TransformSession } from "./transformSession";
import { DrawingEditor } from "./drawingEditor";
import { selectedItems } from "../document/relations";

export type { Shape, Tool } from "./shapes";
export type { EditorUi } from "./ui";

export class EditorController {
  readonly graph: Graph;
  readonly drawing: DrawingEditor;
  tool: Tool = "select";
  editId: string | null = null;
  selectOnEdit = false;
  armedIcon: { key: string; title: string } | null = null;
  armedScreen: ScreenSize | null = null;
  referencesVisible = false;
  connectionSource = "";
  /** The deck the last slide placed here joined, which the next one joins too. */
  lastDeck = "";
  readonly ui: EditorUi = initialUi();
  /** Where the pointer last was over the canvas, in screen coordinates, if it is there. */
  pointer: { clientX: number; clientY: number } | null = null;
  /** The room this editor works in, for commands that reach its files and pictures. */
  room: RoomSession | null = null;
  /** The item whose tree, contents and references stay bright while all else dims, if any. */
  focus: string | null = null;
  /** The tags, markers, tasks and editors this person is filtering by; empty filters nothing. */
  filter: Filter = EMPTY_FILTER;
  version = 0;
  /** Receives in-progress move and resize boxes so peers can see a drag before it lands. */
  onPreview: (boxes: PreviewBox[] | null) => void = () => {};
  private projecting = false;
  private committing = false;
  private committed = false;
  private destroyed = false;
  private previewing = false;
  private transforms: TransformSession;
  private lastPreview = 0;
  private listeners = new Set<() => void>();
  private viewListeners = new Set<() => void>();
  private viewVersion = 0;
  private cleanupInput: () => void;
  private cleanupIcons: () => void;
  readonly band: RubberBandHandler;

  readonly grid: CanvasGrid;
  /** Where this person's view was before each jump. */
  readonly history: ViewHistory;
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
    configureCulling(
      this.graph,
      () => this.referencesVisible,
      () => this.drawing.visible
    );
    this.graph.isToggleEvent = (event) => event.shiftKey || event.ctrlKey || event.metaKey;
    this.graph.setDisconnectOnMove(false);
    this.graph.setDropEnabled(true);
    this.graph.setSplitEnabled(false);
    configureConnectionPoints(this.graph, this.document);
    configurePanels(this.graph, this.document);
    configureComposition(this.graph, this.document);
    this.drawing = new DrawingEditor(this, () => {
      this.project();
      this.emit();
    });
    this.graph.addMouseListener({
      mouseDown: () => {},
      mouseMove: () => this.publishPreview(),
      mouseUp: () => this.clearPreview(),
    });
    this.graph.getStylesheet().getDefaultEdgeStyle().edgeStyle = "orthogonalEdgeStyle";
    this.band = new RubberBandHandler(this.graph);
    // Alt moves a topic without its branches, so it cannot also force a marquee.
    this.band.isForceRubberbandEvent = () => false;
    configureLocking(this.graph, this.document);
    this.graph.getDataModel().addListener(InternalEvent.CHANGE, this.onGraphChange);
    this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, this.emit);
    this.graph.view.addListener(InternalEvent.SCALE_AND_TRANSLATE, this.onView);
    this.graph.view.addListener(InternalEvent.SCALE, this.onView);
    this.graph.view.addListener(InternalEvent.TRANSLATE, this.onView);
    this.document.doc.on("update", this.onDocumentChange);
    this.document.undo.on("stack-item-added", this.emit);
    this.document.undo.on("stack-item-popped", this.emit);
    this.history = trackViewHistory(this.graph, element);
    this.transforms = new TransformSession(document);
    this.cleanupInput = bindCanvasInput(this);
    const stops = [
      subscribeIcons(() => this.project()),
      subscribePictures(() => this.project()),
      keepArranged(this.document),
      observeViewport(element, () => {
        this.graph.view.revalidate();
        this.onView();
      }),
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
  subscribeView = (listener: () => void) => {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  };
  viewSnapshot = () => this.viewVersion;
  emit = () => {
    this.version++;
    this.listeners.forEach((listener) => listener());
  };
  private onView = () => {
    syncZoom(this.graph, this.element);
    this.drawing.refresh();
    this.viewVersion++;
    this.viewListeners.forEach((listener) => listener());
  };
  private onDocumentChange = () => {
    if (this.committing) {
      this.committed = true;
      return;
    }
    this.project(false);
    this.emit();
  };
  private onGraphChange = (_sender: unknown, event: EventObject) => {
    if (this.projecting) return;
    this.committing = true;
    try {
      commitGraph(this.graph, this.document, event.getProperty("edit") as UndoableEdit);
      syncLineAnchors(this.graph, this.document);
    } finally {
      this.committing = false;
    }
    if (this.committed) {
      this.committed = false;
      // maxGraph queues edits made while it notifies listeners and never redraws them,
      // so the resulting projection runs once this model update has fully ended.
      queueMicrotask(() => {
        if (!this.destroyed) this.project(false);
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
      x: (event.clientX - bounds.left - this.graph.getPanDx()) / scale - translate.x,
      y: (event.clientY - bounds.top - this.graph.getPanDy()) / scale - translate.y,
    };
  }
  private publishPreview() {
    if (performance.now() - this.lastPreview < 80) return;
    const boxes = previewBoxes(this.graph);
    if (!boxes.length) return;
    this.lastPreview = performance.now();
    this.previewing = true;
    this.ui.dragging = true;
    this.onPreview(boxes);
  }
  private clearPreview() {
    if (!this.previewing) return;
    this.previewing = false;
    this.ui.dragging = false;
    this.onPreview(null);
    this.emit();
  }
  setFocus(id: string | null) {
    this.focus = id;
    this.project();
    this.emit();
  }
  setFilter(filter: Filter) {
    this.filter = filter;
    this.project();
    this.emit();
  }
  private project(force = true) {
    this.projecting = true;
    try {
      const bright = brightSet(this.document.list(), this.focus, this.filter);
      projectDocument(this.graph, this.document, this.presenter.active, bright, force);
    } finally {
      this.projecting = false;
    }
    this.marks.refresh();
    this.drawing.refresh();
  }

  armIcon(icon: { key: string; title: string }) {
    this.setTool("icon");
    this.armedIcon = icon;
  }
  armScreen(screen: ScreenSize) {
    this.setTool("frame");
    this.armedScreen = screen;
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
    this.drawing.refresh();
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
      ...defaultFields(type, stencil),
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
    const item = this.document.get(id);
    if (item?.locked) return;
    if (this.drawing.enter(id)) return;
    if (item?.type === "drawing") return;
    this.editId = id;
    this.selectOnEdit = selectText;
    this.emit();
  }
  closeEditor() {
    this.editId = null;
    this.emit();
  }
  /** Leaves selection, inline editing, focus and any armed tool behind, as Escape does. */
  clearEditing() {
    this.drawing.leave();
    if (this.focus) this.setFocus(null);
    this.editId = null;
    this.graph.clearSelection();
    this.graph.getPlugin<ConnectionHandler>("ConnectionHandler")?.constraintHandler.reset();
    this.setTool("select");
  }
  stack(direction: "front" | "back") {
    stackSelection(this, direction);
  }
  /** Objects a collective transform changes: the selection, descendants and inner routes. */
  transformSnapshot() {
    return this.selectionClosure().map((id) => this.document.get(id)!);
  }
  beginTransform() {
    this.transforms.begin();
  }
  applyTransform(items: Item[], transform: SelectionTransform) {
    this.transforms.apply(items, transform);
  }
  endTransform() {
    this.transforms.end();
  }
  updateGeometry(id: string, values: Partial<Pick<Item, "x" | "y" | "width" | "height">>) {
    updateCellGeometry(this.graph, this.document, id, values);
  }
  group() {
    groupSelection(this);
  }
  ungroup() {
    ungroupSelection(this);
  }
  connect() {
    connectSelection(this);
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
    const ids = this.selected().map((item) => item.id);
    return ids.length ? selectedItems(this.document.list(), ids).map((item) => item.id) : [];
  }
  zoom(factor: number) {
    this.graph.zoomTo(clampScale(this.graph.view.scale * factor), true);
  }
  fit() {
    fitContents(this.graph, this.element, this.document.list());
  }
  destroy() {
    if (this.transforms.active) this.endTransform();
    this.destroyed = true;
    this.cleanupIcons();
    this.cleanupInput();
    this.band.onDestroy();
    this.document.doc.off("update", this.onDocumentChange);
    this.document.undo.off("stack-item-added", this.emit);
    this.document.undo.off("stack-item-popped", this.emit);
    this.graph.destroy();
    this.listeners.clear();
    this.viewListeners.clear();
  }
}
