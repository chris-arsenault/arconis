import type { Arrangement, ArrangedItem, FlowArrangement, Item, Look } from "./types";
import { DEFAULT_GAP, footprint, paddingOf, union, type Box } from "./layout";

/** Decode the peer/file boundary once; layout always receives a complete flow arrangement. */
export function readArrangement(value: unknown): Arrangement {
  if (!value || typeof value !== "object" || !("how" in value)) return { how: "free" };
  const raw = value as Record<string, unknown>;
  const gap = typeof raw.gap === "number" ? raw.gap : DEFAULT_GAP;
  if (raw.how === "grid")
    return {
      how: "grid",
      columns: typeof raw.columns === "number" ? raw.columns : 1,
      gap,
      align: "center",
    };
  if (raw.how !== "row" && raw.how !== "column") return { how: "free" };
  const align = readAlignment(raw.align);
  return {
    how: raw.how,
    gap,
    align,
  };
}
function readAlignment(value: unknown): FlowArrangement["align"] {
  return value === "top" ||
    value === "bottom" ||
    value === "middle" ||
    value === "left" ||
    value === "right"
    ? value
    : "center";
}

/** Offset across a row or column, independent of how the arrangement was authored. */
function crossOffset(align: FlowArrangement["align"], extent: number, size: number) {
  if (align === "top" || align === "left") return 0;
  if (align === "bottom" || align === "right") return extent - size;
  return (extent - size) / 2;
}

/** Top-left positions of spaces within a row, column or grid. */
export function slots(spaces: Box[], arrangement: FlowArrangement) {
  const gap = arrangement.gap;
  const across = arrangement.how === "row" ? "height" : "width";
  const along = arrangement.how === "row" ? "width" : "height";
  const extent = Math.max(0, ...spaces.map((space) => space[across]));
  const cell = {
    width: Math.max(0, ...spaces.map((space) => space.width)),
    height: Math.max(0, ...spaces.map((space) => space.height)),
  };
  const count = arrangement.how === "grid" ? Math.max(1, arrangement.columns) : 1;
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
export function arrangedOrder(members: Item[], arrangement: FlowArrangement, last: string[] = []) {
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
  frame: ArrangedItem,
  members: Item[],
  lookOf: (item: Item) => Look,
  last: string[] = []
) {
  const arrangement = frame.arrange;
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
