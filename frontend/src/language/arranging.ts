import { isBox, type Item } from "../document/types";
import type { Draft } from "./draft";
import { DEFAULT_GAP, paddingOf, union, type Box } from "./layout";
import { crossOffset } from "./placement";
import type { Attribute } from "./syntax";

/** Arranging and fitting items within a draft. */

export type Arrange = Extract<Attribute, { kind: "arrange" }>;

/** Where a member of a row, column or grid goes, measured from the arrangement's corner. */
function slot(
  arrange: Arrange,
  index: number,
  space: Box,
  sizes: { cell: { width: number; height: number }; extent: number; cursor: number }
) {
  const gap = arrange.gap ?? DEFAULT_GAP;
  if (arrange.how === "grid") {
    const count = Math.max(1, arrange.columns ?? 1);
    const { cell } = sizes;
    return {
      x: (index % count) * (cell.width + gap) + (cell.width - space.width) / 2,
      y: Math.floor(index / count) * (cell.height + gap) + (cell.height - space.height) / 2,
    };
  }
  const across = arrange.how === "row" ? "height" : "width";
  const offset = crossOffset(arrange.align, sizes.extent, space[across]);
  return arrange.how === "row" ? { x: sizes.cursor, y: offset } : { x: offset, y: sizes.cursor };
}

/** Lays members out from 0,0 in a row, column or grid, returning the box they fill. */
export function arrangeMembers(draft: Draft, members: string[], arrange: Arrange): Box {
  const spaces = members.map((id) => draft.spaceOf(id));
  const present = spaces.filter((space): space is Box => space !== null);
  const across = arrange.how === "row" ? "height" : "width";
  const along = arrange.how === "row" ? "width" : "height";
  const sizes = {
    extent: Math.max(0, ...present.map((space) => space[across])),
    cell: {
      width: Math.max(0, ...present.map((space) => space.width)),
      height: Math.max(0, ...present.map((space) => space.height)),
    },
    cursor: 0,
  };
  members.forEach((id, index) => {
    const space = spaces[index];
    if (!space) return;
    const target = slot(arrange, index, space, sizes);
    sizes.cursor += space[along] + (arrange.gap ?? DEFAULT_GAP);
    draft.shift([id], target.x - space.x, target.y - space.y);
  });
  const laid = members
    .map((id) => draft.spaceOf(id))
    .filter((space): space is Box => space !== null);
  return union(laid) ?? { x: 0, y: 0, width: 0, height: 0 };
}

function within(inner: Box, outer: Box) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
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
