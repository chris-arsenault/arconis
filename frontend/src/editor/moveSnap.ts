import {
  Point,
  type Cell,
  type CellState,
  type EdgeHandler,
  type Graph,
  type Guide,
  type SelectionCellsHandler,
  type SelectionHandler,
} from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isLink, type ConnectionPort, type Item } from "../document/types";
import { straightSnap, type LineEnd, type Spot, type StraightRun } from "../document/straightLines";

/**
 * Soft snapping for native moves and line edits. Within a few screen pixels a move clicks into
 * alignment with other objects or into the place where one of its lines runs straight, and a bend
 * or segment dragged near its neighbours lines up with them; further away the pointer is free.
 * A straight line takes an axis before alignment does, and alignment before the grid.
 */

/** How near, in screen pixels, a move or a line edit must come to a snap to take it. */
export const SNAP_PIXELS = 8;

function worldPoint(graph: Graph, state: CellState, port: ConnectionPort): Spot {
  const { scale, translate } = graph.view;
  const [px, py] = port ?? [0.5, 0.5];
  return {
    x: (state.x + state.width * px) / scale - translate.x,
    y: (state.y + state.height * py) / scale - translate.y,
  };
}

/** A line seen from the end at `near`: that end's point and the line's next point. */
function endFrom(graph: Graph, line: Item, fromMoves: boolean): LineEnd | null {
  const model = graph.getDataModel();
  const stateOf = (id: string) => {
    const cell = model.getCell(id);
    return cell ? graph.view.getState(cell) : null;
  };
  const near = fromMoves
    ? { id: line.from, port: line.fromPort, bend: line.points[0] }
    : { id: line.to, port: line.toPort, bend: line.points.at(-1) };
  const far = fromMoves
    ? { id: line.to, port: line.toPort }
    : { id: line.from, port: line.fromPort };
  const nearState = stateOf(near.id);
  const farState = stateOf(far.id);
  if (!nearState || !farState) return null;
  return {
    at: worldPoint(graph, nearState, near.port),
    toward: near.bend
      ? { x: near.bend[0], y: near.bend[1] }
      : worldPoint(graph, farState, far.port),
  };
}

/** Every line with exactly one end on something that moves, as seen from that end. */
function movingEnds(graph: Graph, items: Item[], cells: Cell[]): LineEnd[] {
  const moving = new Set(
    cells.flatMap((cell) => cell.filterDescendants(() => true)).map((cell) => cell.id)
  );
  return items
    .filter((item) => isLink(item) && moving.has(item.from) !== moving.has(item.to))
    .map((line) => endFrom(graph, line, moving.has(line.from)))
    .filter((end): end is LineEnd => end !== null);
}

/** Shows one of the guide's lines along a straight run, in place of an alignment it overrode. */
function markRun(graph: Graph, guide: Guide, upright: boolean, run: StraightRun) {
  let shape = upright ? guide.guideX : guide.guideY;
  if (!shape) {
    shape = guide.createGuideShape(upright);
    shape.dialect = "svg";
    shape.pointerEvents = false;
    shape.init(graph.view.getOverlayPane());
    if (upright) guide.guideX = shape;
    else guide.guideY = shape;
  }
  const { scale, translate } = graph.view;
  const view = (spot: Spot) =>
    new Point((spot.x + translate.x) * scale, (spot.y + translate.y) * scale);
  shape.points = [view(run.from), view(run.to)];
  shape.node.style.visibility = "visible";
  shape.redraw();
}

/** Gives each native move's guide a fixed screen tolerance and straight-line snapping. */
function configureMoves(graph: Graph, handler: SelectionHandler, document: CanvasDocument) {
  const createGuide = handler.createGuide.bind(handler);
  handler.createGuide = () => {
    const guide = createGuide();
    // Alignment pulls from the same screen distance at any zoom, with the grid on or off.
    guide.getGuideTolerance = () => SNAP_PIXELS / graph.view.scale;
    const move = guide.move.bind(guide);
    // The lines that leave the moving objects are the same for the whole move.
    let ends: LineEnd[] | null = null;
    guide.move = (bounds, delta, gridEnabled, clone) => {
      const free = { x: delta.x, y: delta.y };
      const aligned = move(bounds, delta, gridEnabled, clone);
      if (!bounds) return aligned;
      ends ??= movingEnds(graph, document.list(), handler.cells ?? []);
      const { scale } = graph.view;
      const snap = straightSnap(ends, free.x / scale, free.y / scale, SNAP_PIXELS / scale);
      if (snap.upright) markRun(graph, guide, true, snap.upright);
      if (snap.level) markRun(graph, guide, false, snap.level);
      return new Point(
        snap.dx === null ? aligned.x : snap.dx * scale,
        snap.dy === null ? aligned.y : snap.dy * scale
      );
    };
    return guide;
  };
}

/** A dragged bend or segment snaps to its line's other points and the centres of its ends. */
function configureLineEdits(graph: Graph) {
  const handlers = graph.getPlugin<SelectionCellsHandler>("SelectionCellsHandler");
  if (!handlers) return;
  const createEdgeHandler = handlers.createEdgeHandler.bind(handlers);
  handlers.createEdgeHandler = (...args) => {
    const handler: EdgeHandler = createEdgeHandler(...args);
    handler.snapToTerminals = true;
    handler.getSnapToTerminalTolerance = () => SNAP_PIXELS;
    return handler;
  };
}

export function configureSoftSnap(
  graph: Graph,
  handler: SelectionHandler,
  document: CanvasDocument
) {
  configureMoves(graph, handler, document);
  configureLineEdits(graph);
}
