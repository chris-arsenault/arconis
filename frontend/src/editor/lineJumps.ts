import {
  ConnectorShape,
  ShapeRegistry,
  type AbstractCanvas2D,
  type CellState,
  type Graph,
  type Point,
} from "@maxgraph/core";
import { lineJumps, type Jump, type Polyline } from "../document/crossings";

/**
 * Connectors hop where they cross. The crossings are worked out after each view validation from
 * every straight line's drawn points; a line whose hops changed is repainted with them.
 */

/** The hop's radius, and how far a crossing must be from a line's end to get one, in canvas units. */
const JUMP_RADIUS = 5;
const END_CLEARANCE = 12;

/** The style name of the shape lines are drawn with; maxGraph's own "line" is a separator box. */
export const LINE_SHAPE = "hoppingLine";

interface Spot {
  x: number;
  y: number;
}

const along = (from: Spot, to: Spot, distance: number, length: number): Spot => ({
  x: from.x + ((to.x - from.x) * distance) / length,
  y: from.y + ((to.y - from.y) * distance) / length,
});

class LineShape extends ConnectorShape {
  /** Hops along the line, as fractions of its segments, so they hold through zoom and pan. */
  jumps: Jump[] = [];
  jumpKey = "";

  override paintLine(canvas: AbstractCanvas2D, points: Point[], rounded = false) {
    if (!this.jumps.length || points.length < 2) {
      super.paintLine(canvas, points, rounded);
      return;
    }
    canvas.begin();
    canvas.moveTo(points[0].x, points[0].y);
    const corner = rounded ? this.getBaseArcSize() : 0;
    for (let index = 1; index < points.length; index += 1)
      this.paintSegment(canvas, points, index, corner);
    canvas.stroke();
  }

  /** Where the hops on a segment sit, measured from the segment's drawn start. */
  private hopsOn(index: number, drawnFrom: Spot) {
    // The line's own points, before arrowheads shortened its ends, in the canvas's unscaled units.
    const from = this.points[index - 1];
    const to = this.points[index];
    if (!from || !to) return [];
    const start: Spot = { x: from.x / this.scale, y: from.y / this.scale };
    const end: Spot = { x: to.x / this.scale, y: to.y / this.scale };
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const lead = Math.hypot(drawnFrom.x - start.x, drawnFrom.y - start.y);
    return this.jumps
      .filter((jump) => jump.segment === index - 1)
      .map((jump) => jump.t * length - lead);
  }

  private paintSegment(canvas: AbstractCanvas2D, points: Point[], index: number, corner: number) {
    const from = points[index - 1];
    const to = points[index];
    const next = points[index + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) return;
    const turn = next ? Math.hypot(next.x - to.x, next.y - to.y) : 0;
    const cut = next ? Math.min(corner, length / 2, turn / 2) : 0;
    // Left to right an arc swept clockwise rises over the crossing; right to left, the other way.
    const sweep = to.x === from.x ? to.y > from.y : to.x > from.x;
    let pen = 0;
    for (const centre of this.hopsOn(index, from)) {
      if (centre - JUMP_RADIUS < pen || centre + JUMP_RADIUS > length - cut) continue;
      const enter = along(from, to, centre - JUMP_RADIUS, length);
      const leave = along(from, to, centre + JUMP_RADIUS, length);
      canvas.lineTo(enter.x, enter.y);
      canvas.arcTo(JUMP_RADIUS, JUMP_RADIUS, 0, false, sweep, leave.x, leave.y);
      pen = centre + JUMP_RADIUS;
    }
    const stop = along(from, to, length - cut, length);
    canvas.lineTo(stop.x, stop.y);
    if (cut > 0) {
      const resume = along(to, next, cut, turn);
      canvas.quadTo(to.x, to.y, resume.x, resume.y);
    }
  }
}

ShapeRegistry.add(LINE_SHAPE, LineShape);

function isStraightLine(state: CellState) {
  return state.shape instanceof LineShape && !state.style.curved && state.absolutePoints.length > 1;
}

function polylineOf(state: CellState): Polyline {
  const points = state.absolutePoints.flatMap((point): [number, number][] =>
    point ? [[point.x, point.y]] : []
  );
  return { id: state.cell.id ?? "", points };
}

/** Gives every straight line its current hops, repainting the ones whose hops changed. */
function refreshJumps(graph: Graph) {
  const states = [...graph.view.getStates().values()].filter(isStraightLine);
  // Ordered by id, so which of two like lines hops does not depend on drawing order.
  states.sort((a, b) => (a.cell.id ?? "").localeCompare(b.cell.id ?? ""));
  const jumps = lineJumps(states.map(polylineOf), END_CLEARANCE * graph.view.scale);
  for (const state of states) {
    const shape = state.shape as LineShape;
    const found = jumps.get(state.cell.id ?? "") ?? [];
    const key = found.map((jump) => `${jump.segment}:${jump.t.toFixed(4)}`).join(" ");
    if (key === shape.jumpKey) continue;
    shape.jumps = found;
    shape.jumpKey = key;
    shape.redraw();
  }
}

/** Works out the hops again whenever the view has been validated. */
export function configureLineJumps(graph: Graph) {
  const { view } = graph;
  const validate = view.validate.bind(view);
  view.validate = (cell) => {
    validate(cell);
    refreshJumps(graph);
  };
}
