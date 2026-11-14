import { EdgeMarkerRegistry, type AbstractCanvas2D, type Point } from "@maxgraph/core";
import type { Arrow } from "../document/types";

/**
 * Line ends as maxGraph draws them. Arrowheads, dots and diamonds are maxGraph's own markers, filled
 * or hollow; bars, crosses and the entity-relationship cardinalities are drawn here.
 */

/** The maxGraph marker and fill each line end draws with. */
export const MARKERS: Record<Arrow, { marker: string; filled: boolean }> = {
  none: { marker: "none", filled: false },
  arrow: { marker: "block", filled: true },
  open: { marker: "open", filled: false },
  classic: { marker: "classic", filled: true },
  thin: { marker: "classicThin", filled: true },
  triangle: { marker: "block", filled: false },
  dot: { marker: "oval", filled: true },
  circle: { marker: "oval", filled: false },
  diamond: { marker: "diamond", filled: true },
  "hollow-diamond": { marker: "diamond", filled: false },
  bar: { marker: "arconis-bar", filled: false },
  cross: { marker: "arconis-cross", filled: false },
  one: { marker: "arconis-one", filled: false },
  "only-one": { marker: "arconis-only-one", filled: false },
  many: { marker: "arconis-many", filled: false },
  "one-or-many": { marker: "arconis-one-or-many", filled: false },
  "zero-or-one": { marker: "arconis-zero-or-one", filled: false },
  "zero-or-many": { marker: "arconis-zero-or-many", filled: false },
};

/** One stroke of a drawn end, in distances back along the line and across it. */
type Stroke =
  | { bar: number; half: number }
  | { cross: number; half: number }
  | { fork: number; half: number }
  | { ring: number; radius: number };

interface Frame {
  canvas: AbstractCanvas2D;
  end: Point;
  /** Unit vector along the line toward its end. */
  ux: number;
  uy: number;
}

const at = ({ end, ux, uy }: Frame, back: number, across: number) => ({
  x: end.x - ux * back - uy * across,
  y: end.y - uy * back + ux * across,
});

function segment(frame: Frame, a: { x: number; y: number }, b: { x: number; y: number }) {
  frame.canvas.moveTo(a.x, a.y);
  frame.canvas.lineTo(b.x, b.y);
}

function draw(frame: Frame, stroke: Stroke) {
  if ("bar" in stroke)
    segment(frame, at(frame, stroke.bar, -stroke.half), at(frame, stroke.bar, stroke.half));
  else if ("cross" in stroke) {
    const { cross: back, half } = stroke;
    segment(frame, at(frame, back - half, -half), at(frame, back + half, half));
    segment(frame, at(frame, back - half, half), at(frame, back + half, -half));
  } else if ("fork" in stroke) {
    // A crow's foot: three prongs from a point on the line, spread across the end.
    for (const across of [-stroke.half, 0, stroke.half])
      segment(frame, at(frame, stroke.fork, 0), at(frame, 0, across));
  } else {
    const centre = at(frame, stroke.ring, 0);
    frame.canvas.ellipse(
      centre.x - stroke.radius,
      centre.y - stroke.radius,
      stroke.radius * 2,
      stroke.radius * 2
    );
  }
}

/**
 * A marker drawn from strokes sized by the line's marker size. The line runs to the end under the
 * strokes; a ring stops it and carries on past it, so the ring stays hollow.
 */
function drawn(strokes: (size: number) => Stroke[]) {
  return (
    canvas: AbstractCanvas2D,
    _shape: unknown,
    _type: unknown,
    pe: Point,
    unitX: number,
    unitY: number,
    size: number
  ) => {
    const frame: Frame = { canvas, end: pe.clone(), ux: unitX, uy: unitY };
    const parts = strokes(size);
    const ring = parts.find((part) => "ring" in part);
    if (ring && "ring" in ring) {
      // The line stops at the ring's far side and resumes from its near side to the end.
      pe.x -= unitX * (ring.ring + ring.radius);
      pe.y -= unitY * (ring.ring + ring.radius);
    }
    return () => {
      canvas.begin();
      if (ring && "ring" in ring)
        segment(frame, at(frame, ring.ring - ring.radius, 0), at(frame, 0, 0));
      for (const part of parts.filter((part) => !("ring" in part))) draw(frame, part);
      canvas.stroke();
      if (ring) {
        canvas.begin();
        draw(frame, ring);
        canvas.stroke();
      }
    };
  };
}

/** Entity-relationship ends are sized from a marker twice an arrowhead's length. */
const DRAWN: Record<string, (size: number) => Stroke[]> = {
  "arconis-bar": (s) => [{ bar: s, half: s }],
  "arconis-cross": (s) => [{ cross: s, half: s * 0.7 }],
  "arconis-one": (s) => [{ bar: s * 1.4, half: s }],
  "arconis-only-one": (s) => [
    { bar: s * 1.2, half: s },
    { bar: s * 2, half: s },
  ],
  "arconis-many": (s) => [{ fork: s * 2, half: s }],
  "arconis-one-or-many": (s) => [
    { fork: s * 2, half: s },
    { bar: s * 2.6, half: s },
  ],
  "arconis-zero-or-one": (s) => [
    { bar: s * 1.4, half: s },
    { ring: s * 3, radius: s * 0.8 },
  ],
  "arconis-zero-or-many": (s) => [
    { fork: s * 2, half: s },
    { ring: s * 3.2, radius: s * 0.8 },
  ],
};

for (const [name, strokes] of Object.entries(DRAWN)) EdgeMarkerRegistry.add(name, drawn(strokes));
