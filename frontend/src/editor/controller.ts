import {
  Cell,
  Graph,
  InternalEvent,
  RubberBandHandler,
  PanningHandler,
  ConnectionHandler,
  ImageBox,
  Point,
} from "@maxgraph/core";
import { CanvasDocument } from "../document/canvasDocument";
import { KIND_LABELS, LOCAL, type ObjectKind, type Bookmark } from "../document/types";
import { projectDocument } from "./projection";
import { commitGraph } from "./graphChanges";
import { bindCanvasInput } from "./input";

export type Tool = ObjectKind | "select" | "pan";

export class EditorController {
  readonly graph: Graph;
  tool: Tool = "select";
  editId: string | null = null;
  version = 0;
  private projecting = false;
  private listeners = new Set<() => void>();
  private cleanupInput: () => void;
  private band: RubberBandHandler;

  constructor(
    readonly element: HTMLDivElement,
    readonly document: CanvasDocument
  ) {
    InternalEvent.disableContextMenu(element);
    this.graph = new Graph(element);
    this.graph.getDataModel().createId = () => crypto.randomUUID();
    this.graph.setPanning(true);
    this.graph.setConnectable(true);
    this.graph.setAllowDanglingEdges(false);
    this.graph.setCellsEditable(false);
    this.graph.setHtmlLabels(false);
    this.graph.setDisconnectOnMove(false);
    this.graph.setDropEnabled(true);
    this.graph.setSplitEnabled(false);
    const connection = this.graph.getPlugin<ConnectionHandler>("ConnectionHandler");
    if (connection) {
      connection.connectImage = new ImageBox("/connection.svg", 18, 18);
      connection.getIconPosition = (_icon, state) =>
        new Point(state.x + state.width + 12, state.y + state.height / 2);
    }
    this.graph.getStylesheet().getDefaultEdgeStyle().edgeStyle = "orthogonalEdgeStyle";
    this.band = new RubberBandHandler(this.graph);
    this.graph.getDataModel().addListener(InternalEvent.CHANGE, this.onGraphChange);
    this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, this.emit);
    this.graph.view.addListener(InternalEvent.SCALE_AND_TRANSLATE, this.emit);
    this.graph.view.addListener(InternalEvent.SCALE, this.emit);
    this.graph.view.addListener(InternalEvent.TRANSLATE, this.emit);
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
  private onDocumentChange = () => {
    this.project();
    this.emit();
  };
  private onGraphChange = () => {
    if (!this.projecting) {
      commitGraph(this.graph, this.document);
      this.emit();
    }
  };
  private project() {
    this.projecting = true;
    try {
      projectDocument(this.graph, this.document);
    } finally {
      this.projecting = false;
    }
  }

  setTool(tool: Tool) {
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
    const offset = (this.document.objects.size % 6) * 16;
    const id = this.document.create(kind, x ?? centerX - 80 + offset, y ?? centerY - 45 + offset, {
      label: kind === "sticky" ? "Your idea here" : KIND_LABELS[kind],
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
  edit(id: string) {
    this.editId = id;
    this.emit();
  }
  closeEditor() {
    this.editId = null;
    this.emit();
  }
  group() {
    if (this.graph.getSelectionCount() > 1) {
      const group = new Cell("Group");
      group.setVertex(true);
      this.graph.groupCells(group, 28);
    }
  }
  ungroup() {
    this.graph.ungroupCells();
  }
  connect() {
    const cells = this.graph.getSelectionCells().filter((cell) => cell.isVertex());
    if (cells.length === 2)
      this.document.create("connector", 0, 0, { source: cells[0].id!, target: cells[1].id! });
  }
  duplicate() {
    const ids = this.duplicateClosure();
    const mapping = new Map(ids.map((id) => [id, crypto.randomUUID()]));
    this.document.undo.stopCapturing();
    this.document.doc.transact(
      () =>
        ids.forEach((id) => {
          const item = this.document.get(id)!;
          const offset = mapping.has(item.parent) ? 0 : 28;
          this.document.insert({
            ...item,
            id: mapping.get(id)!,
            x: item.x + offset,
            y: item.y + offset,
            points:
              item.kind === "stroke"
                ? JSON.stringify(
                    (JSON.parse(item.points) as [number, number][]).map(([x, y]) => [
                      x + offset,
                      y + offset,
                    ])
                  )
                : item.points,
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
  private duplicateClosure() {
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
    this.graph.zoomTo(Math.min(64, Math.max(0.02, this.graph.view.scale * factor)), true);
    this.emit();
  }
  fit() {
    const bounds = this.graph.getGraphBounds();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const view = this.graph.view;
    const x = bounds.x / view.scale - view.translate.x;
    const y = bounds.y / view.scale - view.translate.y;
    const scale = Math.min(
      2,
      (this.element.clientWidth - 120) / (bounds.width / view.scale),
      (this.element.clientHeight - 120) / (bounds.height / view.scale)
    );
    view.scaleAndTranslate(Math.max(0.02, scale), 60 / scale - x, 60 / scale - y);
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
    this.cleanupInput();
    this.band.onDestroy();
    this.document.doc.off("update", this.onDocumentChange);
    this.document.undo.off("stack-item-added", this.emit);
    this.document.undo.off("stack-item-popped", this.emit);
    this.graph.destroy();
    this.listeners.clear();
  }
}
