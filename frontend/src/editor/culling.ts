import type { Cell, Geometry, Graph } from "@maxgraph/core";

/** Anything drawn smaller than this disappears, and reappears on zooming toward it. */
export const CULL_PIXELS = 4;
/** Text smaller than this cannot be read, and each label is costly to draw. */
const MIN_LABEL_PIXELS = 4;
const DEFAULT_FONT_SIZE = 14;

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
  // A connector goes with either end. A drawing has no ends, only its own extent.
  if (cell.source || cell.target)
    return [cell.source, cell.target].some((end) => end !== null && isCulled(end, scale));
  return pathSize(geometry) * scale < CULL_PIXELS;
}

/** True for a cell drawn too small to see, or held inside one that is. */
export function isCulled(cell: Cell, scale: number) {
  for (let current: Cell | null = cell; current; current = current.parent)
    if (tooSmall(current, scale)) return true;
  return false;
}

/** True when zooming in on this object would reveal something it holds. */
export function hasHiddenDetail(cell: Cell, scale: number) {
  return cell.children.some((child) => child.isVertex() && tooSmall(child, scale));
}

export function labelIsLegible(cell: Cell, scale: number) {
  const size = Number(cell.getStyle().fontSize ?? DEFAULT_FONT_SIZE);
  return size * scale >= MIN_LABEL_PIXELS;
}

/** Leaves culled cells out of the view, along with reference lines unless they are switched on. */
export function configureCulling(graph: Graph, showReferences: () => boolean) {
  const { view } = graph;
  const validateCell = view.validateCell.bind(view);
  view.validateCell = (cell: Cell, visible = true) => {
    const style = cell.getStyle() as Record<string, unknown>;
    const reference = style.reference === true;
    const shown = !(reference && !showReferences()) && !tooSmall(cell, view.scale);
    return validateCell(cell, visible && shown);
  };
}
