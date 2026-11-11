import { isFrame, type Item } from "./types";

/**
 * Docked frames: frames whose edges meet share those edges. When one frame's edge moves, the
 * frames docked to it on that edge move theirs too, so a row or column of frames behaves as
 * lanes without a lane item type.
 */

/** How close two edges are before they count as one, in canvas units. */
const DOCK_TOLERANCE = 1;
type Box = Pick<Item, "x" | "y" | "width" | "height">;
type Patch = { id: string; values: Partial<Item> };

const near = (a: number, b: number) => Math.abs(a - b) <= DOCK_TOLERANCE;
const alongY = (a: Box, b: Box) => a.y < b.y + b.height && b.y < a.y + a.height;
const alongX = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width;
const right = (box: Box) => box.x + box.width;
const bottom = (box: Box) => box.y + box.height;

/**
 * Each edge of a frame: where it was, where it is, whether a neighbour meets it there, and the
 * values that neighbour takes to keep meeting it.
 */
const EDGES: {
  moved: (before: Box, after: Box) => boolean;
  meets: (other: Box, before: Box) => boolean;
  follow: (other: Box, after: Box) => Partial<Item>;
}[] = [
  {
    moved: (before, after) => !near(right(before), right(after)),
    meets: (other, before) => near(other.x, right(before)) && alongY(other, before),
    follow: (other, after) => ({ x: right(after), width: right(other) - right(after) }),
  },
  {
    moved: (before, after) => !near(before.x, after.x),
    meets: (other, before) => near(right(other), before.x) && alongY(other, before),
    follow: (other, after) => ({ width: after.x - other.x }),
  },
  {
    moved: (before, after) => !near(bottom(before), bottom(after)),
    meets: (other, before) => near(other.y, bottom(before)) && alongX(other, before),
    follow: (other, after) => ({ y: bottom(after), height: bottom(other) - bottom(after) }),
  },
  {
    moved: (before, after) => !near(before.y, after.y),
    meets: (other, before) => near(bottom(other), before.y) && alongX(other, before),
    follow: (other, after) => ({ height: after.y - other.y }),
  },
];

/** Other frames beside this one, at the same level, that could share an edge with it. */
function neighbours(items: Item[], frame: Item) {
  return items.filter(
    (other) => other.id !== frame.id && isFrame(other) && other.inside === frame.inside
  );
}

/**
 * The changes docked neighbours take when a frame's box goes from `before` to `after`: an edge
 * that moved drags along the neighbours' edges that met it. A frame that moved as a whole drags
 * nothing, since its neighbours would simply be left behind.
 */
export function dockedFollowers(items: Item[], frame: Item, before: Box, after: Box): Patch[] {
  const movedWhole =
    near(before.width, after.width) &&
    near(before.height, after.height) &&
    (!near(before.x, after.x) || !near(before.y, after.y));
  if (movedWhole) return [];
  const patches: Patch[] = [];
  for (const other of neighbours(items, frame))
    for (const edge of EDGES)
      if (edge.moved(before, after) && edge.meets(other, before))
        patches.push({ id: other.id, values: edge.follow(other, after) });
  return patches.filter(({ values }) => (values.width ?? 1) > 0 && (values.height ?? 1) > 0);
}
