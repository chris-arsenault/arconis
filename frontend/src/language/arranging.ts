import { isArranged, isBox, isFrame, type FlowArrangement, type Item } from "../document/types";
import type { Draft } from "./draft";
import { DEFAULT_GAP, paddingOf, union, type Box } from "../document/layout";
import { slots, arrangedLayout } from "../document/arrangement";
import type { Attribute } from "./syntax";

/** Arranging and fitting items within a draft. */

export type Arrange = Extract<Attribute, { kind: "arrange" }>;

/** Lays members out from 0,0 in a row, column or grid, returning the box they fill. */
export function arrangeMembers(draft: Draft, members: string[], arrange: FlowArrangement): Box {
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
/** Boxes a holder lays out: what it holds, other than bands. */
function laidOut(draft: Draft, holder: Item) {
  return [...draft.items.values()].filter(
    (other) => other.inside === holder.id && isBox(other) && other.type !== "band"
  );
}

export function reflowDraft(draft: Draft) {
  const frames = [...draft.items.values()].filter(isArranged);
  frames.sort((a, b) => draft.ancestors(b).length - draft.ancestors(a).length);
  for (const frame of frames) {
    const members = laidOut(draft, frame);
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
  const held = laidOut(draft, frame);
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

/** Frames grow to hold whatever was added or moved into them during the write, innermost first. */
export function growHolders(draft: Draft) {
  const holders = new Set<string>();
  for (const id of [...draft.created, ...draft.moved]) {
    const item = draft.items.get(id);
    if (item) draft.ancestors(item).forEach((holder) => holders.add(holder));
  }
  const frames = [...holders].map((id) => draft.items.get(id)!).filter(isFrame);
  frames.sort((a, b) => draft.ancestors(b).length - draft.ancestors(a).length);
  frames.forEach((frame) => fitFrame(draft, frame, false, { width: true, height: true }));
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
