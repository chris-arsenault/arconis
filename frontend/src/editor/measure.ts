import type { Item } from "../document/types";

type Box = Pick<Item, "x" | "y" | "width" | "height">;

/** The empty distance between two spans on one axis, or zero when they overlap. */
function gapAlong(aStart: number, aSize: number, bStart: number, bSize: number) {
  if (bStart >= aStart + aSize) return bStart - (aStart + aSize);
  if (aStart >= bStart + bSize) return aStart - (bStart + bSize);
  return 0;
}

/** The gaps between two boxes along each axis, with where to draw each label, in world units. */
export function gapsBetween(
  a: Box,
  b: Box,
  label: (distance: number) => string = (distance) => String(Math.round(distance))
) {
  const gaps: { label: string; x: number; y: number }[] = [];
  const horizontal = gapAlong(a.x, a.width, b.x, b.width);
  const vertical = gapAlong(a.y, a.height, b.y, b.height);
  if (horizontal > 0) {
    const left = Math.min(a.x + a.width, b.x + b.width);
    gaps.push({
      label: label(horizontal),
      x: left + horizontal / 2,
      y: a.y + a.height / 2,
    });
  }
  if (vertical > 0) {
    const top = Math.min(a.y + a.height, b.y + b.height);
    gaps.push({ label: label(vertical), x: a.x + a.width / 2, y: top + vertical / 2 });
  }
  return gaps;
}
