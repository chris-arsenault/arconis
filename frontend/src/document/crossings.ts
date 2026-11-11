/**
 * Where straight lines cross, one of the two hops over the other so a reader can tell a crossing
 * from a junction. The flatter line hops; between two alike, the later one does.
 */

type Point = [number, number];

export interface Polyline {
  id: string;
  points: Point[];
}

/** A hop on a line: which of its segments, and how far along that segment from 0 to 1. */
export interface Jump {
  segment: number;
  t: number;
}

interface Segment {
  path: number;
  index: number;
  from: Point;
  to: Point;
  length: number;
  minX: number;
  maxX: number;
  /** Whether it runs more across than up and down. */
  flat: boolean;
}

function segmentsOf(paths: Polyline[]) {
  const segments: Segment[] = [];
  paths.forEach((path, pathIndex) => {
    for (let index = 0; index + 1 < path.points.length; index += 1) {
      const from = path.points[index];
      const to = path.points[index + 1];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      segments.push({
        path: pathIndex,
        index,
        from,
        to,
        length,
        minX: Math.min(from[0], to[0]),
        maxX: Math.max(from[0], to[0]),
        flat: Math.abs(dx) >= Math.abs(dy),
      });
    }
  });
  return segments.sort((a, b) => a.minX - b.minX);
}

/** How far along each segment the two cross, or null when they do not cross within both. */
function crossing(a: Segment, b: Segment) {
  const rx = a.to[0] - a.from[0];
  const ry = a.to[1] - a.from[1];
  const sx = b.to[0] - b.from[0];
  const sy = b.to[1] - b.from[1];
  const denominator = rx * sy - ry * sx;
  // Parallel lines never cross; ones lying along each other have no single crossing to hop.
  if (Math.abs(denominator) < 1e-9) return null;
  const qx = b.from[0] - a.from[0];
  const qy = b.from[1] - a.from[1];
  return { t: (qx * sy - qy * sx) / denominator, u: (qx * ry - qy * rx) / denominator };
}

/** Whether a point `t` along a segment keeps `clearance` from both of its ends. */
function clear(segment: Segment, t: number, clearance: number) {
  return t * segment.length >= clearance && (1 - t) * segment.length >= clearance;
}

/** Of two crossing segments, the one that hops. */
function hops(a: Segment, b: Segment) {
  if (a.flat !== b.flat) return a.flat;
  if (a.path !== b.path) return a.path > b.path;
  return a.index > b.index;
}

/**
 * The hops each line makes over the others. A crossing closer than `clearance` to an end of either
 * line is a junction or a corner and gets none.
 */
export function lineJumps(paths: Polyline[], clearance: number) {
  const jumps = new Map<string, Jump[]>();
  const segments = segmentsOf(paths);
  const add = (segment: Segment, t: number) => {
    const id = paths[segment.path].id;
    jumps.set(id, [...(jumps.get(id) ?? []), { segment: segment.index, t }]);
  };
  segments.forEach((a, at) => {
    // Sorted by their left edge, so nothing after the first that starts past `a` can reach it.
    for (
      let other = at + 1;
      other < segments.length && segments[other].minX <= a.maxX;
      other += 1
    ) {
      const b = segments[other];
      const found = crossing(a, b);
      if (!found || !clear(a, found.t, clearance) || !clear(b, found.u, clearance)) continue;
      if (hops(a, b)) add(a, found.t);
      else add(b, found.u);
    }
  });
  for (const [id, list] of jumps) {
    list.sort((a, b) => a.segment - b.segment || a.t - b.t);
    // Several lines crossed at one point take one hop.
    const distinct = list.filter((jump, index) => {
      const before = list[index - 1];
      return !before || before.segment !== jump.segment || jump.t - before.t > 1e-6;
    });
    jumps.set(id, distinct);
  }
  return jumps;
}
