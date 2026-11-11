import type { Cell, Graph, SelectionHandler } from "@maxgraph/core";
import { canHoldWorkspace, canConnect } from "../document/capabilities";
import type { CanvasDocument } from "../document/canvasDocument";
import { isUnderlay } from "./templates";
import {
  alignOffsets,
  anchorOf,
  branchCopiesParent,
  branchDescendants,
  branchParent,
  branchPlacement,
  distributeOffsets,
  movedWithContents,
  type AlignMode,
  type Axis,
  type Offset,
} from "../document/relations";
import { LOCAL, isBox, type Item } from "../document/types";
import { layoutTree } from "../document/treeLayout";
import type { EditorController } from "./controller";
import { fittingView, flyToView } from "./views";
import { creationSize, creationValues } from "./zoom";

const ANCHOR_PIXELS = 14;
/** How much of the window an object fills after zooming into it. */
const ZOOM_FILL = 0.8;
const JUMP_FILL = 0.3;
const SLIDE_FILL = 0.9;

function isLine(item: Item) {
  return !isBox(item);
}

/** A world point midway along a line as it is currently drawn, or null if it is not drawn. */
function lineMidpoint(graph: Graph, lineId: string) {
  const cell = graph.getDataModel().getCell(lineId);
  const state = cell && graph.view.getState(cell);
  if (!state?.absolutePoints.length) return null;
  const { scale, translate } = graph.view;
  const point = graph.view.getPoint(state);
  return { x: point.x / scale - translate.x, y: point.y / scale - translate.y };
}

interface EndpointPlan {
  item: Item;
  insert: boolean;
}

/** Resolve geometry before a topology command mutates anything. New anchors are still drafts. */
function planEndpoint(editor: EditorController, item: Item): EndpointPlan | null {
  if (!canConnect(item)) return null;
  if (!isLine(item)) return { item, insert: false };
  const { document, graph } = editor;
  const existing = anchorOf(document.list(), item.id);
  if (existing) return { item: existing, insert: false };
  const middle = lineMidpoint(graph, item.id);
  if (!middle) return null;
  const size = ANCHOR_PIXELS / graph.view.scale;
  const anchor = document.build("node", middle.x - size / 2, middle.y - size / 2, {
    stencil: "ellipse",
    width: size,
    height: size,
    onLine: item.id,
  });
  return { item: anchor, insert: true };
}

/** Keeps each line's anchor at its midpoint, carrying what it holds and its branches along. */
export function syncLineAnchors(graph: Graph, document: CanvasDocument) {
  const items = document.list();
  for (const anchor of items) {
    if (!anchor.onLine) continue;
    const middle = lineMidpoint(graph, anchor.onLine);
    if (!middle) continue;
    const dx = middle.x - anchor.width / 2 - anchor.x;
    const dy = middle.y - anchor.height / 2 - anchor.y;
    if (Math.abs(dx) < anchor.width / 100 && Math.abs(dy) < anchor.height / 100) continue;
    const moved = [anchor.id, ...branchDescendants(items, anchor.id)];
    moved.forEach((id) =>
      movedWithContents(items, id, dx, dy).forEach(({ id: target, values }) =>
        document.patch(target, values)
      )
    );
  }
}

/** A branch is a compact topic: a short phrase wide and one line tall, growing as text is typed. */
const BRANCH_WIDTH = 160;
const BRANCH_HEIGHT = 48;

function branchSize(editor: EditorController, parent: Item) {
  if (!branchCopiesParent(parent)) {
    const node = creationSize("node", editor.graph.view.scale);
    return { width: node.width, height: (BRANCH_HEIGHT * node.width) / BRANCH_WIDTH };
  }
  const scale = parent.look?.scale ?? 1;
  return {
    width: Math.min(parent.width, BRANCH_WIDTH * scale),
    height: Math.min(parent.height, BRANCH_HEIGHT * scale),
  };
}

/** A new topic beside or under `parent`, looking like it when that suits a topic. */
function topicFor(editor: EditorController, parent: Item, x: number, y: number) {
  const { width, height } = branchSize(editor, parent);
  const created = creationValues("node", editor.graph.view.scale);
  const fields: Partial<Item> = branchCopiesParent(parent)
    ? {
        stencil: parent.stencil,
        style: parent.style,
        look: { ...parent.look, textFit: "height" },
      }
    : { ...created, look: { ...created.look, textFit: "height" } };
  const type = branchCopiesParent(parent) ? parent.type : "node";
  return editor.document.build(type, x, y, { width, height, inside: parent.inside, ...fields });
}

/** Grows a new topic out of the selection, or beside it. Returns its identifier. */
export function addBranch(editor: EditorController, sibling = false) {
  const [selected] = editor.selected();
  if (!selected) return "";
  const { document, graph } = editor;
  const items = document.list();
  const endpoint = sibling ? null : planEndpoint(editor, selected);
  const parent = sibling ? document.get(branchParent(items, selected.id)) : endpoint?.item;
  if (!parent) return "";
  const plannedItems = endpoint?.insert ? [...items, parent] : items;
  const placed = branchPlacement(plannedItems, parent, branchSize(editor, parent));
  const node = topicFor(editor, parent, placed.x, placed.y);
  document.undo.stopCapturing();
  document.doc.transact(() => {
    if (endpoint?.insert) document.insert({ ...endpoint.item, order: document.nextOrder() });
    document.insert({ ...node, order: document.nextOrder() });
    document.insert(
      document.build("branch", 0, 0, {
        from: parent.id,
        to: node.id,
        ...creationValues("branch", graph.view.scale),
        fromPort: [placed.towardLeft ? 0 : 1, 0.5],
        toPort: [placed.towardLeft ? 1 : 0, 0.5],
      })
    );
  }, LOCAL);
  document.undo.stopCapturing();
  editor.select(node.id);
  editor.edit(node.id, true);
  return node.id;
}

/** Points the first of two selected objects at the second, with no physical link implied. */
export function addReference(editor: EditorController) {
  connectSelection(editor, "reference");
}

/** Anchor creation and its relationship are one command and one local undo step. */
export function connectSelection(editor: EditorController, type: "line" | "reference" = "line") {
  const selected = editor
    .selected()
    .filter((item) => type === "reference" || item.type !== "drawing");
  if (selected.length !== 2) return;
  link(editor, selected[0], selected[1], type);
}

/**
 * Relates an object to a chosen target, as a reference: no tree structure, no
 * physical line, just "see also". The selection stays where it is.
 */
export function relateTo(
  editor: EditorController,
  targetId: string,
  sourceId = editor.selected()[0]?.id
) {
  const selected = sourceId ? editor.document.get(sourceId) : undefined;
  const target = editor.document.get(targetId);
  if (!selected || !target || selected.id === target.id) return;
  link(editor, selected, target, "reference");
}

function link(editor: EditorController, a: Item, b: Item, type: "line" | "reference") {
  const [from, to] = [a, b].map((item) => planEndpoint(editor, item));
  if (!from || !to) return;
  const { document } = editor;
  document.undo.stopCapturing();
  document.doc.transact(() => {
    if (from.insert) document.insert({ ...from.item, order: document.nextOrder() });
    if (to.insert) document.insert({ ...to.item, order: document.nextOrder() });
    document.insert(
      document.build(type, 0, 0, {
        from: from.item.id,
        to: to.item.id,
        ...creationValues(type, editor.graph.view.scale),
      })
    );
  }, LOCAL);
  document.undo.stopCapturing();
}

/** Lays out the selected topic's tree, moving each object along with what it holds. */
export function tidySelection(editor: EditorController) {
  const [selected] = editor.selected();
  if (!selected) return;
  const { document } = editor;
  const items = document.list();
  const placed = layoutTree(items, selected.id, selected.tidy);
  document.undo.stopCapturing();
  document.doc.transact(() => {
    placed.forEach(({ x, y }, id) => {
      const item = items.find((candidate) => candidate.id === id)!;
      movedWithContents(items, id, x - item.x, y - item.y).forEach(({ id: target, values }) =>
        document.patch(target, values)
      );
    });
  }, LOCAL);
  document.undo.stopCapturing();
}

function flyTo(
  editor: EditorController,
  item: Pick<Item, "x" | "y" | "width" | "height">,
  fill: number
) {
  const { element, graph } = editor;
  flyToView(graph, element, fittingView(item, element, fill));
}

/** Zooms until the selection fills the window, revealing whatever it holds. */
export function zoomIntoSelection(editor: EditorController) {
  const [selected] = editor.selected();
  if (!selected) return;
  if (!isLine(selected)) return flyTo(editor, selected, ZOOM_FILL);
  const anchor = anchorOf(editor.document.list(), selected.id);
  if (anchor) return flyTo(editor, anchor, ZOOM_FILL);
  const middle = lineMidpoint(editor.graph, selected.id);
  if (!middle) return;
  const size = ANCHOR_PIXELS / editor.graph.view.scale;
  flyTo(
    editor,
    { x: middle.x - size / 2, y: middle.y - size / 2, width: size, height: size },
    ZOOM_FILL
  );
}

/** Zooms back out to the object holding the selection, or to the whole canvas. */
export function zoomOutOfSelection(editor: EditorController) {
  const [selected] = editor.selected();
  const parent = selected && editor.document.get(selected.inside);
  if (parent) flyTo(editor, parent, ZOOM_FILL);
  else editor.fit();
}

/** Follows a reference, keeping enough around the target to see where it sits. */
export function jumpTo(editor: EditorController, id: string) {
  const item = editor.document.get(id);
  if (!item) return;
  editor.select(id);
  if (isBox(item)) return flyTo(editor, item, JUMP_FILL);
  const cell = editor.graph.getDataModel().getCell(id);
  const box = cell ? editor.graph.getBoundingBox([cell]) : null;
  if (!box) return;
  const { scale, translate } = editor.graph.view;
  const width = Math.max(box.width, ANCHOR_PIXELS);
  const height = Math.max(box.height, ANCHOR_PIXELS);
  flyTo(
    editor,
    {
      x: (box.x + (box.width - width) / 2) / scale - translate.x,
      y: (box.y + (box.height - height) / 2) / scale - translate.y,
      width: width / scale,
      height: height / scale,
    },
    JUMP_FILL
  );
}

/** Selects a slide and flies to it with a little canvas showing around it. */
export function goToSlide(editor: EditorController, id: string) {
  const slide = editor.document.get(id);
  if (!slide) return;
  editor.select(id);
  flyTo(editor, slide, SLIDE_FILL);
}

/** Moves objects with anything they hold, as one undo step. */
function applyOffsets(editor: EditorController, offsets: Map<string, Offset>) {
  const model = editor.graph.getDataModel();
  model.beginUpdate();
  try {
    offsets.forEach(({ dx, dy }, id) => {
      const cell = model.getCell(id);
      if (cell && (dx || dy)) editor.graph.moveCells([cell], dx, dy);
    });
  } finally {
    model.endUpdate();
  }
}

/** Selected objects that move for themselves, leaving out ones held by another selected object. */
function movableSelection(editor: EditorController) {
  const selected = editor.selected().filter(isBox);
  const ids = new Set(selected.map((item) => item.id));
  return selected.filter((item) => !ids.has(item.inside));
}

export function alignSelection(editor: EditorController, mode: AlignMode) {
  applyOffsets(editor, alignOffsets(movableSelection(editor), mode));
}

export function distributeSelection(editor: EditorController, axis: Axis) {
  applyOffsets(editor, distributeOffsets(movableSelection(editor), axis));
}

/**
 * Any object can hold others, and moving a topic moves its branches, which Alt skips. Dragging an
 * object onto one larger than itself nests it; anything else leaves it where it was dropped.
 */
export function configureComposition(graph: Graph, document: CanvasDocument) {
  // A template's underlay can neither be picked nor hold anything: the slide beneath it can.
  const selectable = graph.isCellSelectable.bind(graph);
  graph.isCellSelectable = (cell) => !isUnderlay(cell) && selectable(cell);
  graph.isValidDropTarget = (target: Cell, cells?: Cell[]) => {
    if (!target.isVertex() || !target.geometry || isUnderlay(target)) return false;
    const item = document.get(target.id ?? "");
    if (item && !canHoldWorkspace(item)) return false;
    if ((cells ?? []).some((cell) => document.get(cell.id ?? "")?.markup)) return false;
    const area = target.geometry.width * target.geometry.height;
    return (cells ?? []).every(
      (cell) =>
        cell !== target &&
        !cell.isAncestor(target) &&
        (cell.geometry?.width ?? 0) * (cell.geometry?.height ?? 0) < area
    );
  };
  const rotatable = graph.isCellRotatable.bind(graph);
  // Native rotation turns one shape. An object holding others rotates through the selection frame.
  graph.isCellRotatable = (cell) => rotatable(cell) && !cell.children.length;
  const moveCells = graph.moveCells.bind(graph);
  graph.moveCells = (
    cells,
    dx = 0,
    dy = 0,
    clone = false,
    target = null,
    event = null,
    mapping
  ) => {
    const items = document.list();
    const moved = new Set(cells);
    const followers = event?.altKey || clone ? [] : followerCells(graph, items, moved);
    const model = graph.getDataModel();
    model.beginUpdate();
    try {
      const result = moveCells(cells, dx, dy, clone, target, event, mapping);
      if (followers.length) moveCells(followers, dx, dy, false, null, event);
      return result;
    } finally {
      model.endUpdate();
    }
  };
  const handler = graph.getPlugin<SelectionHandler>("SelectionHandler");
  if (handler) handler.guidesEnabled = true;
}

function followerCells(graph: Graph, items: Item[], moved: Set<Cell>) {
  const model = graph.getDataModel();
  const followers = new Set<Cell>();
  moved.forEach((cell) =>
    branchDescendants(items, cell.id ?? "").forEach((id) => {
      const follower = model.getCell(id);
      if (follower && !moved.has(follower) && !hasAncestorIn(follower, moved))
        followers.add(follower);
    })
  );
  return [...followers];
}

function hasAncestorIn(cell: Cell, cells: Set<Cell>) {
  for (let parent = cell.parent; parent; parent = parent.parent) if (cells.has(parent)) return true;
  return false;
}
