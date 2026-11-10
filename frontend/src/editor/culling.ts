import {
  Rectangle,
  InternalEvent,
  mathUtils,
  type Cell,
  type CellState,
  type Geometry,
  type Graph,
} from "@maxgraph/core";
import { viewportSize } from "./zoom";

/** Anything drawn smaller than this disappears, and reappears on zooming toward it. */
export const CULL_PIXELS = 4;
/** Text smaller than this cannot be read, and each label is costly to draw. */
const MIN_LABEL_PIXELS = 4;
const DEFAULT_FONT_SIZE = 14;
const exporting = new WeakMap<Graph, boolean>();

/** Export chooses annotation visibility independently of the person's current view. */
export function exportMarkup(graph: Graph, visible: boolean | null) {
  if (visible === null) exporting.delete(graph);
  else exporting.set(graph, visible);
  graph.view.revalidate();
}

const pathSizes = new WeakMap<Geometry, number>();

function pathSize(geometry: Geometry) {
  const known = pathSizes.get(geometry);
  if (known !== undefined) return known;
  const ends = [geometry.sourcePoint, geometry.targetPoint].flatMap((point) => point ?? []);
  const points = [...ends, ...(geometry.points ?? [])];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  pathSizes.set(geometry, size);
  return size;
}

function tooSmall(cell: Cell, scale: number): boolean {
  const { geometry } = cell;
  if (!geometry) return false;
  if (cell.isVertex()) return Math.max(geometry.width, geometry.height) * scale < CULL_PIXELS;
  if (!cell.isEdge()) return false;
  // Routed connector extents are known at paint time; endpoint size does not decide visibility.
  if (cell.source || cell.target) return false;
  return pathSize(geometry) * scale < CULL_PIXELS;
}

/** Size culling is independent of containment: children may extend beyond a tiny holder. */
export function isCulled(cell: Cell, scale: number) {
  return tooSmall(cell, scale);
}

/** True when zooming in on this object would reveal something it holds. */
export function hasHiddenDetail(cell: Cell, scale: number) {
  return cell.children.some((child) => child.isVertex() && tooSmall(child, scale));
}

export function labelIsLegible(cell: Cell, scale: number) {
  const size = Number(cell.getStyle().fontSize ?? DEFAULT_FONT_SIZE);
  return size * scale >= MIN_LABEL_PIXELS;
}

/**
 * Leaves culled cells out of the view, along with reference lines unless they are switched on or
 * `showReference` asks for that one, as it does for references of the selection.
 */
export function configureCulling(
  graph: Graph,
  showReference: (cell: Cell) => boolean,
  showMarkup = () => true
) {
  const { view } = graph;
  const validateCell = view.validateCell.bind(view);
  view.validateCell = (cell: Cell, visible = true) => {
    const style = cell.getStyle() as Record<string, unknown>;
    const reference = style.reference === true;
    const shown =
      !(reference && !showReference(cell)) &&
      !(style.markup && !(exporting.get(graph) ?? showMarkup()));
    return validateCell(cell, visible && shown);
  };
  configureViewportRendering(graph);
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => view.revalidate());
}

/** Keep all states for routing and hit testing. Only painting uses the viewport; exports draw
 * the complete scene. One viewport of overscan also covers a native pointer-pan preview. */
function configureViewportRendering(graph: Graph) {
  const renderer = graph.cellRenderer;
  const redraw = renderer.redraw.bind(renderer);
  const hidden = new WeakSet<CellState>();
  renderer.redraw = (state, force = false, rendering = true) => {
    const shown = shouldPaint(graph, state);
    const wasHidden = hidden.has(state);
    redraw(state, force || (wasHidden && shown), rendering && shown);
    showState(state, shown);
    if (shown) hidden.delete(state);
    else hidden.add(state);
  };
}

function shouldPaint(graph: Graph, state: CellState) {
  const size = Math.max(state.width, state.height);
  if (exporting.has(graph)) return size >= 1;
  return graph.isCellSelected(state.cell) || (size >= CULL_PIXELS && inViewport(graph, state));
}

function showState(state: CellState, shown: boolean) {
  const display = shown ? "" : "none";
  for (const node of [state.shape?.node, state.text?.node, state.control?.node])
    if (node && node.style.display !== display) node.style.display = display;
}

function inViewport(graph: Graph, state: CellState) {
  // Unclipped text can extend arbitrarily beyond its cell. Keep it rendered, including line
  // labels and frame titles, rather than estimating its extent from nominal text bounds.
  if (!graph.isLabelClipped(state.cell) && state.cell.value) return true;
  const { width, height } = viewportSize(graph.container);
  const bounds =
    mathUtils.getBoundingBox(
      new Rectangle(state.x, state.y, state.width, state.height),
      Number(state.style.rotation ?? 0)
    ) ?? state;
  return (
    bounds.x <= width * 2 &&
    bounds.y <= height * 2 &&
    bounds.x + bounds.width >= -width &&
    bounds.y + bounds.height >= -height
  );
}
