import type { Arrangement, Item, Look } from "./types";
import { DEFAULT_GAP, footprint, paddingOf, union, type Box } from "./layout";

/** Offset across a row or column, independent of how the arrangement was authored. */
function crossOffset(align: Arrangement["align"], extent: number, size: number) {
  if (align === "top" || align === "left") return 0;
  if (align === "bottom" || align === "right") return extent - size;
  return (extent - size) / 2;
}

/** Top-left positions of spaces within a row, column or grid. */
export function slots(spaces: Box[], arrangement: Arrangement) {
  const gap = arrangement.gap ?? DEFAULT_GAP;
  const across = arrangement.how === "row" ? "height" : "width";
  const along = arrangement.how === "row" ? "width" : "height";
  const extent = Math.max(0, ...spaces.map((space) => space[across]));
  const cell = {
    width: Math.max(0, ...spaces.map((space) => space.width)),
    height: Math.max(0, ...spaces.map((space) => space.height)),
  };
  const count = Math.max(1, arrangement.columns ?? 1);
  let cursor = 0;
  return spaces.map((space, index) => {
    if (arrangement.how === "grid")
      return {
        x: (index % count) * (cell.width + gap) + (cell.width - space.width) / 2,
        y: Math.floor(index / count) * (cell.height + gap) + (cell.height - space.height) / 2,
      };
    const offset = crossOffset(arrangement.align, extent, space[across]);
    const at = cursor;
    cursor += space[along] + gap;
    return arrangement.how === "row" ? { x: at, y: offset } : { x: offset, y: at };
  });
}

/** Members in spatial order, with explicitly appended members after the rest. */
export function arrangedOrder(members: Item[], arrangement: Arrangement, last: string[] = []) {
  const key = (item: Item) => {
    const x = item.x + item.width / 2;
    const y = item.y + item.height / 2;
    if (arrangement.how === "row") return [x, y];
    if (arrangement.how === "column") return [y, x];
    return [Math.round(y), x];
  };
  const placed = members.filter((item) => !last.includes(item.id));
  placed.sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1 - b1 || a2 - b2 || a.id.localeCompare(b.id);
  });
  const after = last
    .map((id) => members.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  return [...placed, ...after];
}

/** Shared editor/language layout: member offsets and the frame's resulting size. */
export function arrangedLayout(
  frame: Item,
  members: Item[],
  lookOf: (item: Item) => Look,
  last: string[] = []
) {
  const arrangement = frame.arrange!;
  const ordered = arrangedOrder(members, arrangement, last);
  const spaces = ordered.map((item) => footprint(item, lookOf(item)));
  const padding = paddingOf(frame, lookOf(frame));
  const origin = { x: frame.x + padding.left, y: frame.y + padding.top };
  const targets = slots(spaces, arrangement);
  const moves = new Map<string, { dx: number; dy: number }>();
  ordered.forEach((item, index) =>
    moves.set(item.id, {
      dx: origin.x + targets[index].x - spaces[index].x,
      dy: origin.y + targets[index].y - spaces[index].y,
    })
  );
  const laid = union(
    spaces.map((space, index) => ({
      ...space,
      x: origin.x + targets[index].x,
      y: origin.y + targets[index].y,
    }))
  );
  const size = laid
    ? {
        width: laid.x + laid.width + padding.right - frame.x,
        height: laid.y + laid.height + padding.bottom - frame.y,
      }
    : { width: frame.width, height: frame.height };
  return { moves, size };
}
