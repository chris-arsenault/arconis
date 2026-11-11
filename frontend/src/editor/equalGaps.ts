import { Point, type Cell, type Graph, type SelectionHandler, type Shape } from "@maxgraph/core";
import { equalGapSnap, type EqualGap, type GapBox } from "../document/equalGaps";

/**
 * Equal-gap snapping for native moves. The move's alignment guide decides first; on an axis it
 * leaves free, a box nearing equal spacing with its neighbours snaps there, and the equal gaps
 * are kept here for the overlay that marks them.
 */

/** How near, in screen pixels, a box must come to equal spacing to snap to it. */
const SNAP_PIXELS = 8;

const shown = new WeakMap<Graph, EqualGap[]>();

/** The equal gaps of the move in progress, in world units; empty when none are marked. */
export function equalGapsOf(graph: Graph): EqualGap[] {
  return shown.get(graph) ?? [];
}

function isMoving(cell: Cell, moving: Set<Cell>) {
  for (let current: Cell | null = cell; current; current = current.getParent())
    if (moving.has(current)) return true;
  return false;
}

/** World boxes of every drawn object that is not part of the move. */
function otherBoxes(graph: Graph, cells: Cell[]): GapBox[] {
  const moving = new Set(cells);
  const { scale, translate } = graph.view;
  return [...graph.view.getStates().values()]
    .filter((state) => state.cell.isVertex() && !isMoving(state.cell, moving))
    .map((state) => ({
      x: state.x / scale - translate.x,
      y: state.y / scale - translate.y,
      width: state.width / scale,
      height: state.height / scale,
    }));
}

const isShown = (guide: Shape | null) => guide?.node?.style.visibility === "visible";

/** Adds equal-gap snapping to the guide each native move creates. */
export function configureEqualGaps(graph: Graph, handler: SelectionHandler) {
  const createGuide = handler.createGuide.bind(handler);
  handler.createGuide = () => {
    const guide = createGuide();
    const move = guide.move.bind(guide);
    const hide = guide.hide.bind(guide);
    const destroy = guide.destroy.bind(guide);
    // The boxes that stay put are the same for the whole move.
    let others: GapBox[] | null = null;
    guide.move = (bounds, delta, gridEnabled, clone) => {
      // Where the pointer has the box, before the grid or an alignment guide rounds it.
      const free = { x: delta.x, y: delta.y };
      const aligned = move(bounds, delta, gridEnabled, clone);
      if (!bounds) return aligned;
      others ??= otherBoxes(graph, handler.cells ?? []);
      const { scale, translate } = graph.view;
      const moving = {
        x: (bounds.x + free.x) / scale - translate.x,
        y: (bounds.y + free.y) / scale - translate.y,
        width: bounds.width / scale,
        height: bounds.height / scale,
      };
      const snap = equalGapSnap(moving, others, SNAP_PIXELS / scale);
      // An alignment guide that has taken an axis keeps it; otherwise equal spacing beats the grid.
      const across = !isShown(guide.guideX) && snap.gaps.some((gap) => gap.y1 === gap.y2);
      const down = !isShown(guide.guideY) && snap.gaps.some((gap) => gap.x1 === gap.x2);
      shown.set(
        graph,
        snap.gaps.filter((gap) => (gap.y1 === gap.y2 ? across : down))
      );
      return new Point(
        across ? free.x + snap.dx * scale : aligned.x,
        down ? free.y + snap.dy * scale : aligned.y
      );
    };
    guide.hide = () => {
      hide();
      shown.delete(graph);
    };
    guide.destroy = () => {
      destroy();
      shown.delete(graph);
    };
    return guide;
  };
}
