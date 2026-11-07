import {
  Cell,
  Graph,
  InternalEvent,
  RubberBandHandler,
  PanningHandler,
  VertexHandlerConfig,
} from "@maxgraph/core";
import { CanvasDocument } from "../document/canvasDocument";
import {
  KIND_LABELS,
  LOCAL,
  type ObjectKind,
  type Bookmark,
  type CanvasObject,
} from "../document/types";
import { projectDocument } from "./projection";
import { commitGraph } from "./graphChanges";
import { bindCanvasInput } from "./input";
import { previewBoxes, type PreviewBox } from "./preview";
import { configureRendering } from "./rendering";
import { configureConnectionPoints } from "./connectionPoints";
import { clampScale, creationOffset, creationValues, syncZoom } from "./zoom";
import { compareStacking, isVertexKind, offsetPoints } from "../document/geometry";
import { transformObjects, type SelectionTransform } from "../document/transform";

export type Tool = ObjectKind | "select" | "pan";

export class EditorController {
  readonly graph: Graph;
  tool: Tool = "select";
  editId: string | null = null;
  selectOnEdit = false;
  connectionSource = "";
  version = 0;
  /** Receives in-progress move and resize boxes so peers can see a drag before it lands. */
  onPreview: (boxes: PreviewBox[] | null) => void = () => {};
  private projecting = false;
  private committing = false;
  private committed = false;
  private destroyed = false;
  private previewing = false;
  private lastPreview = 0;
  private listeners = new Set<() => void>();
  private cleanupInput: () => void;
  private band: RubberBandHandler;

  constructor(
    readonly element: HTMLDivElement,
    readonly document: CanvasDocument
  ) {
    InternalEvent.disableContextMenu(element);
    VertexHandlerConfig.rotationEnabled = true;
    this.graph = new Graph(element);
    this.graph.getDataModel().createId = () => crypto.randomUUID();
    this.graph.setPanning(true);
    this.graph.setConnectable(true);
    this.graph.setAllowDanglingEdges(false);
    this.graph.setCellsEditable(false);
    configureRendering(this.graph);
    this.graph.isToggleEvent = (event) => event.shiftKey || event.ctrlKey || event.metaKey;
    this.graph.setDisconnectOnMove(false);
    this.graph.setDropEnabled(true);
    this.graph.setSplitEnabled(false);
    configureConnectionPoints(this.graph, this.document);
    this.graph.addMouseListener({
      mouseDown: () => {},
      mouseMove: () => this.publishPreview(),
      mouseUp: () => this.clearPreview(),
    });
    this.graph.getStylesheet().getDefaultEdgeStyle().edgeStyle = "orthogonalEdgeStyle";
    this.band = new RubberBandHandler(this.graph);
    this.graph.getDataModel().addListener(InternalEvent.CHANGE, this.onGraphChange);
    this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, this.emit);
    this.graph.view.addListener(InternalEvent.SCALE_AND_TRANSLATE, this.onView);
    this.graph.view.addListener(InternalEvent.SCALE, this.onView);
    this.graph.view.addListener(InternalEvent.TRANSLATE, this.onView);
    this.document.doc.on("update", this.onDocumentChange);
    this.document.undo.on("stack-item-added", this.emit);
    this.document.undo.on("stack-item-popped", this.emit);
    this.cleanupInput = bindCanvasInput(this);
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
      projectDocument(this.graph, this.document);
    } finally {
      this.projecting = false;
    }
  }

  setTool(tool: Tool) {
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

  add(kind: ObjectKind, x?: number, y?: number) {
    const view = this.graph.view;
    const centerX = this.element.clientWidth / 2 / view.scale - view.translate.x;
    const centerY = this.element.clientHeight / 2 / view.scale - view.translate.y;
    const size = creationOffset(view.scale);
    const offset = (this.document.objects.size % 6) * 16 * size;
    const left = x ?? centerX + (offset - 80) * size;
    const top = y ?? centerY + (offset - 45) * size;
    const id = this.document.create(kind, left, top, {
      label: kind === "sticky" ? "Your idea here" : KIND_LABELS[kind],
      ...creationValues(kind, view.scale),
    });
    this.select(id);
    this.setTool("select");
    return id;
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
  applyTransform(items: CanvasObject[], transform: SelectionTransform) {
    const values = transformObjects(items, transform);
    this.document.doc.transact(() => {
      this.document.freezeLegacyGeometry();
      items.forEach((item) => {
        const { rotation, ...geometry } = values.get(item.id)!;
        this.document.patch(item.id, geometry);
        if (isVertexKind(item.kind) && item.kind !== "group" && transform.angle)
          this.document.patchStyle(item.id, { rotation });
      });
    }, LOCAL);
  }
  endTransform() {
    this.document.undo.captureTimeout = 400;
    this.document.undo.stopCapturing();
  }
  updateGeometry(id: string, values: Partial<Pick<CanvasObject, "x" | "y" | "width" | "height">>) {
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
    if (this.graph.getSelectionCount() > 1) {
      const group = new Cell("Group");
      group.setVertex(true);
      this.graph.groupCells(group, 28);
      this.graph.setSelectionCell(group);
    }
  }
  ungroup() {
    const model = this.graph.getDataModel();
    const labels = new Map(
      Object.values(model.cells || {})
        .filter((cell) => cell.isEdge() && cell.geometry)
        .map((cell) => [cell, cell.geometry!.clone()])
    );
    model.beginUpdate();
    try {
      this.graph.ungroupCells().forEach((cell) => {
        const label = labels.get(cell);
        if (!label || !cell.geometry) return;
        // maxGraph treats relative edge labels as relative child vertices on ungroup.
        const geometry = cell.geometry.clone();
        geometry.x = label.x;
        geometry.y = label.y;
        geometry.relative = true;
        model.setGeometry(cell, geometry);
      });
    } finally {
      model.endUpdate();
    }
  }
  connect() {
    const cells = this.graph.getSelectionCells().filter((cell) => cell.isVertex());
    if (cells.length === 2)
      this.document.create("connector", 0, 0, {
        source: cells[0].id!,
        target: cells[1].id!,
        ...creationValues("connector", this.graph.view.scale),
      });
  }
  duplicate() {
    const ids = this.selectionClosure();
    const mapping = new Map(ids.map((id) => [id, crypto.randomUUID()]));
    const base = this.document.nextOrder();
    this.document.undo.stopCapturing();
    this.document.doc.transact(
      () =>
        ids.forEach((id, index) => {
          const item = this.document.get(id)!;
          const offset = 28;
          this.document.insert({
            ...item,
            order: base + index,
            id: mapping.get(id)!,
            x: isVertexKind(item.kind) ? item.x + offset : item.x,
            y: isVertexKind(item.kind) ? item.y + offset : item.y,
            points: offsetPoints(item.points, offset, offset),
            parent: mapping.get(item.parent) || item.parent,
            source: mapping.get(item.source) || item.source,
            target: mapping.get(item.target) || item.target,
          });
        }),
      LOCAL
    );
    this.document.undo.stopCapturing();
    this.graph.setSelectionCells(
      ids
        .map((id) => this.graph.getDataModel().getCell(mapping.get(id)!))
        .filter((cell) => cell !== null)
    );
  }
  private selectionClosure() {
    const ids = new Set(this.selected().map((item) => item.id));
    const objects = this.document.list();
    let previousSize = -1;
    while (previousSize !== ids.size) {
      previousSize = ids.size;
      objects.filter((item) => ids.has(item.parent)).forEach((item) => ids.add(item.id));
    }
    objects
      .filter((item) => item.kind === "connector" && ids.has(item.source) && ids.has(item.target))
      .forEach((item) => ids.add(item.id));
    return [...ids];
  }
  zoom(factor: number) {
    this.graph.zoomTo(clampScale(this.graph.view.scale * factor), true);
    this.emit();
  }
  fit() {
    const bounds = this.graph.getGraphBounds();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const view = this.graph.view;
    const x = bounds.x / view.scale - view.translate.x;
    const y = bounds.y / view.scale - view.translate.y;
    const scale = clampScale(
      Math.min(
        2,
        (this.element.clientWidth - 120) / (bounds.width / view.scale),
        (this.element.clientHeight - 120) / (bounds.height / view.scale)
      )
    );
    view.scaleAndTranslate(scale, 60 / scale - x, 60 / scale - y);
    this.emit();
  }
  bookmark(name: string) {
    const { scale, translate } = this.graph.view;
    const id = crypto.randomUUID();
    const bookmark: Bookmark = { id, name, scale, x: translate.x, y: translate.y };
    this.document.doc.transact(
      () => this.document.bookmarks.set(id, JSON.stringify(bookmark)),
      LOCAL
    );
  }
  jump(bookmark: Bookmark) {
    this.graph.view.scaleAndTranslate(bookmark.scale, bookmark.x, bookmark.y);
  }
  destroy() {
    this.destroyed = true;
    this.cleanupInput();
    this.band.onDestroy();
    this.document.doc.off("update", this.onDocumentChange);
    this.document.undo.off("stack-item-added", this.emit);
    this.document.undo.off("stack-item-popped", this.emit);
    this.graph.destroy();
    this.listeners.clear();
  }
}
