/**
 * Equal spacing while dragging: when a moving box nears the place where its gap to a neighbour
 * would match the gap between that neighbour and the next, it snaps there and the equal gaps are
 * marked. Worked on each axis alone, among the boxes the moving one shares a row or column with.
 */

export interface GapBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One marked gap: a segment across the empty space, and the gap's size. */
export interface EqualGap {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
}

export interface GapSnap {
  /** How far to shift the moving box on each axis to make the gaps equal. */
  dx: number;
  dy: number;
  gaps: EqualGap[];
}

/** A box along one axis: its extent there, and its extent across it. */
interface Span {
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
}

interface Candidate {
  /** Where the moving box's start would sit. */
  target: number;
  /** The gaps that would be equal, each from one box's edge to the next box's edge. */
  gaps: { from: number; to: number; beside: Span }[];
}

const sharesRow = (a: Span, b: Span) => a.crossStart < b.crossEnd && b.crossStart < a.crossEnd;

/** The nearest box wholly before `edge`, or null. */
function nearestBefore(row: Span[], edge: number) {
  const before = row.filter((span) => span.end <= edge).sort((a, b) => b.end - a.end);
  return before.length ? before[0] : null;
}

/** The nearest box wholly after `edge`, or null. */
function nearestAfter(row: Span[], edge: number) {
  const after = row.filter((span) => span.start >= edge).sort((a, b) => a.start - b.start);
  return after.length ? after[0] : null;
}

/** Midway between the box before and the box after, with the same gap on each side. */
function between(size: number, before: Span, after: Span): Candidate[] {
  const gap = (after.start - before.end - size) / 2;
  if (gap <= 0) return [];
  const target = before.end + gap;
  return [
    {
      target,
      gaps: [
        { from: before.end, to: target, beside: before },
        { from: target + size, to: after.start, beside: after },
      ],
    },
  ];
}

/** After the box before, as far from it as it is from the box before that. */
function continuingAfter(row: Span[], before: Span): Candidate[] {
  const second = nearestBefore(row, before.start);
  if (!second || before.start <= second.end) return [];
  const gap = before.start - second.end;
  return [
    {
      target: before.end + gap,
      gaps: [
        { from: second.end, to: before.start, beside: second },
        { from: before.end, to: before.end + gap, beside: before },
      ],
    },
  ];
}

/** Before the box after, as far from it as it is from the box after that. */
function continuingBefore(row: Span[], size: number, after: Span): Candidate[] {
  const third = nearestAfter(row, after.end);
  if (!third || third.start <= after.end) return [];
  const gap = third.start - after.end;
  return [
    {
      target: after.start - gap - size,
      gaps: [
        { from: after.start - gap, to: after.start, beside: after },
        { from: after.end, to: third.start, beside: third },
      ],
    },
  ];
}

/** The places along one axis where the moving box would be equally spaced. */
function candidates(moving: Span, row: Span[], tolerance: number) {
  const size = moving.end - moving.start;
  const before = nearestBefore(row, moving.start + tolerance);
  const after = nearestAfter(row, moving.end - tolerance);
  return [
    ...(before && after ? between(size, before, after) : []),
    ...(before ? continuingAfter(row, before) : []),
    ...(after ? continuingBefore(row, size, after) : []),
  ];
}

/** The nearest equal spacing within `tolerance` along one axis, or null when there is none. */
function axisSnap(moving: Span, others: Span[], tolerance: number) {
  const row = others.filter((span) => sharesRow(span, moving));
  const near = candidates(moving, row, tolerance)
    .map((candidate) => ({ ...candidate, shift: candidate.target - moving.start }))
    .filter((candidate) => Math.abs(candidate.shift) <= tolerance)
    .sort((a, b) => Math.abs(a.shift) - Math.abs(b.shift));
  if (!near.length) return null;
  const [best] = near;
  // Each gap is marked level with the middle of what the moving box shares with its neighbour.
  const gaps = best.gaps.map(({ from, to, beside }) => {
    const top = Math.max(moving.crossStart, beside.crossStart);
    const bottom = Math.min(moving.crossEnd, beside.crossEnd);
    return { from, to, cross: (top + bottom) / 2 };
  });
  return { shift: best.shift, gaps };
}

const NO_SNAP: { shift: number; gaps: { from: number; to: number; cross: number }[] } = {
  shift: 0,
  gaps: [],
};

const across = (box: GapBox): Span => ({
  start: box.x,
  end: box.x + box.width,
  crossStart: box.y,
  crossEnd: box.y + box.height,
});

const down = (box: GapBox): Span => ({
  start: box.y,
  end: box.y + box.height,
  crossStart: box.x,
  crossEnd: box.x + box.width,
});

/**
 * The shift that spaces `moving` equally with the boxes beside it, within `tolerance` on each
 * axis, and the gaps to mark once it is there.
 */
export function equalGapSnap(moving: GapBox, others: GapBox[], tolerance: number): GapSnap {
  const horizontal = axisSnap(across(moving), others.map(across), tolerance) ?? NO_SNAP;
  const vertical = axisSnap(down(moving), others.map(down), tolerance) ?? NO_SNAP;
  const gaps: EqualGap[] = [
    ...horizontal.gaps.map(({ from, to, cross }) => ({
      x1: from,
      y1: cross,
      x2: to,
      y2: cross,
      size: to - from,
    })),
    ...vertical.gaps.map(({ from, to, cross }) => ({
      x1: cross,
      y1: from,
      x2: cross,
      y2: to,
      size: to - from,
    })),
  ];
  return { dx: horizontal.shift, dy: vertical.shift, gaps };
}
