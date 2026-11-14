/**
 * Straight connectors while dragging: when a moving object nears the place where one of its lines
 * would run exactly level or upright to where that line goes next, it snaps there. Worked on each
 * axis alone; the nearest line on an axis wins it.
 */

export interface Spot {
  x: number;
  y: number;
}

/** A line's end on the moving object, and where the line heads from it. */
export interface LineEnd {
  /** The end's point before the move. */
  at: Spot;
  /** The line's next point: its first bend from this end, or its other end. */
  toward: Spot;
}

/** The segment a snapped line will run along, for marking it. */
export interface StraightRun {
  from: Spot;
  to: Spot;
}

export interface StraightSnap {
  /** The drag on each axis that makes a line straight, or null where none is near. */
  dx: number | null;
  dy: number | null;
  /** The upright run that took the x axis, and the level run that took the y axis. */
  upright: StraightRun | null;
  level: StraightRun | null;
}

interface Best {
  shift: number;
  off: number;
  end: LineEnd;
}

function nearest(ends: LineEnd[], axis: "x" | "y", drag: number, tolerance: number): Best | null {
  const across = axis === "x" ? "y" : "x";
  let best: Best | null = null;
  for (const end of ends) {
    // A line too short along its run has no direction to straighten.
    if (Math.abs(end.toward[across] - end.at[across]) <= tolerance) continue;
    const shift = end.toward[axis] - end.at[axis];
    const off = Math.abs(shift - drag);
    if (off < tolerance && (!best || off < best.off)) best = { shift, off, end };
  }
  return best;
}

/**
 * Where a drag of `dx`, `dy` should land so a line runs straight. `tolerance` is in the same
 * units as the points, how near the drag must come.
 */
export function straightSnap(
  ends: LineEnd[],
  dx: number,
  dy: number,
  tolerance: number
): StraightSnap {
  const x = nearest(ends, "x", dx, tolerance);
  const y = nearest(ends, "y", dy, tolerance);
  const moved = (end: LineEnd) => ({
    x: end.at.x + (x ? x.shift : dx),
    y: end.at.y + (y ? y.shift : dy),
  });
  return {
    dx: x?.shift ?? null,
    dy: y?.shift ?? null,
    upright: x ? { from: moved(x.end), to: x.end.toward } : null,
    level: y ? { from: moved(y.end), to: y.end.toward } : null,
  };
}
