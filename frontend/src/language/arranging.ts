import { isBox, type Arrangement, type Item, type Look } from "../document/types";
import type { Draft } from "./draft";
import { DEFAULT_GAP, footprint, paddingOf, union, type Box } from "./layout";
import { crossOffset } from "./placement";
import type { Attribute } from "./syntax";

/** Arranging and fitting items within a draft. */

export type Arrange = Extract<Attribute, { kind: "arrange" }>;

/**
 * Where each space goes in a row, column or grid, as its top-left corner measured from the
 * arrangement's corner.
 */
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

/** Lays members out from 0,0 in a row, column or grid, returning the box they fill. */
export function arrangeMembers(draft: Draft, members: string[], arrange: Arrangement): Box {
  const present = members
    .map((id) => ({ id, space: draft.spaceOf(id) }))
    .filter((member): member is { id: string; space: Box } => member.space !== null);
  const targets = slots(
    present.map((member) => member.space),
    arrange
  );
  present.forEach(({ id, space }, index) =>
    draft.shift([id], targets[index].x - space.x, targets[index].y - space.y)
  );
  const laid = members
    .map((id) => draft.spaceOf(id))
    .filter((space): space is Box => space !== null);
  return union(laid) ?? { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Members in their arranged order: by where they sit along the arrangement, reading order for a
 * grid, with `last` after the rest in the order given.
 */
export function arrangedOrder(members: Item[], arrangement: Arrangement, last: string[] = []) {
  const center = (item: Item) => ({
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  });
  const key = (item: Item) => {
    const { x, y } = center(item);
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

/**
 * Where an arranged frame's members go and what size the frame becomes: members in order from the
 * frame's top-left inside its padding, and the frame fitted around them.
 */
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
      ...{ x: origin.x + targets[index].x, y: origin.y + targets[index].y },
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

function within(inner: Box, outer: Box) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Puts every arranged frame's members back in arrangement, innermost frames first, with members
 * created in this write after the rest in the order they were written.
 */
export function reflowDraft(draft: Draft) {
  const frames = [...draft.items.values()].filter((item) => item.arrange);
  frames.sort((a, b) => draft.ancestors(b).length - draft.ancestors(a).length);
  for (const frame of frames) {
    const members = [...draft.items.values()].filter(
      (other) => other.inside === frame.id && isBox(other) && other.type !== "band"
    );
    if (!members.length) continue;
    const ids = new Set(members.map((member) => member.id));
    const last = draft.created.filter((id) => ids.has(id));
    const { moves, size } = arrangedLayout(frame, members, (item) => draft.lookOf(item), last);
    moves.forEach(({ dx, dy }, id) => {
      const member = draft.items.get(id)!;
      draft.moveTo(member, member.x + dx, member.y + dy);
    });
    Object.assign(frame, size);
  }
}

/** Which of an item's sides were given, which fitting keeps as a minimum. */
export interface Given {
  width: boolean;
  height: boolean;
}

/**
 * Sizes a frame to hold its contents. With `wrap`, a frame is fitted snugly on each side it was not
 * given; otherwise it only grows, and only when contents cross its edge.
 */
export function fitFrame(draft: Draft, frame: Item, wrap: boolean, given: Given) {
  const held = [...draft.items.values()].filter(
    (other) => other.inside === frame.id && isBox(other) && other.type !== "band"
  );
  const contents = union(held.map((other) => draft.extentOf(other).space));
  if (!contents || (!wrap && within(contents, frame))) return;
  const padding = paddingOf(frame, draft.lookOf(frame));
  const left = Math.min(frame.x, contents.x - padding.left);
  const top = Math.min(frame.y, contents.y - padding.top);
  const right = contents.x + contents.width + padding.right;
  const bottom = contents.y + contents.height + padding.bottom;
  const keepWidth = !wrap || given.width;
  const keepHeight = !wrap || given.height;
  frame.width = Math.max(right, keepWidth ? frame.x + frame.width : right) - left;
  frame.height = Math.max(bottom, keepHeight ? frame.y + frame.height : bottom) - top;
  frame.x = left;
  frame.y = top;
}

/** Below whatever a holder already holds, or at its top-left inside its padding. */
export function spotInside(draft: Draft, holder: Item, item: Item, inset: number) {
  const padding = paddingOf(holder, draft.lookOf(holder));
  const held = [...draft.items.values()]
    .filter((other) => other.inside === holder.id && other.id !== item.id && isBox(other))
    .map((other) => draft.extentOf(other).space);
  const contents = union(held);
  const x = holder.x + padding.left + inset;
  if (!contents) return { x, y: holder.y + padding.top };
  return { x, y: contents.y + contents.height + DEFAULT_GAP };
}

/** Where new top-level items start: to the right of everything already on the canvas. */
export function canvasStart(draft: Draft) {
  const existing = [...draft.items.values()].filter(
    (other) => isBox(other) && !draft.createdHere.has(other.id)
  );
  const bounds = union(existing.map((other) => draft.extentOf(other).space));
  return bounds ? { x: bounds.x + bounds.width + DEFAULT_GAP * 2, y: bounds.y } : { x: 0, y: 0 };
}
