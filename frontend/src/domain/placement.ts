import { CanvasIndex, DomainError, intersects, label } from "./canvasIndex";
import type { Box } from "./model";

export type Side = "left" | "right" | "above" | "below";
export type Edge = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Where an item goes. Exact coordinates suit an agent drawing alone; relative and relational forms
 * keep meaning while others move things.
 */
export type Placement =
  | { x: number; y: number }
  | { by: { dx: number; dy: number } }
  | { beside: string; side: Side; gap?: number }
  | { inside: string }
  | { alignWith: string; edge: Edge };

export const DEFAULT_GAP = 40;
/** Room left inside a region's edge, and under a panel's title. */
const INSET = 24;

export interface Resolved {
  x: number;
  y: number;
  /** A region the placement puts the item in. */
  inside?: string;
}

/**
 * The top-left corner for an item of `size`. `current` is where it is now, or null when it is new;
 * `self` keeps an item from avoiding its own box.
 */
export function resolvePlacement(
  index: CanvasIndex,
  placement: Placement,
  size: { width: number; height: number },
  current: Box | null,
  self = ""
): Resolved {
  if ("x" in placement) return { x: placement.x, y: placement.y };
  if ("by" in placement) {
    if (!current) throw new DomainError("A new item needs a place, not an offset.");
    return { x: current.x + placement.by.dx, y: current.y + placement.by.dy };
  }
  if ("beside" in placement) return beside(index.box(placement.beside), placement, size);
  if ("inside" in placement) {
    const region = index.box(placement.inside);
    return { ...freeSpotInside(index, region, size, self), inside: region.id };
  }
  if (!current) throw new DomainError("A new item needs a place before it can be aligned.");
  return aligned(index.box(placement.alignWith), placement.edge, size, current);
}

type Size = { width: number; height: number };
/** How far apart items inside a region must stay. */
const CLEARANCE = 8;

function beside(target: Box, placement: { side: Side; gap?: number }, size: Size) {
  const gap = placement.gap ?? DEFAULT_GAP;
  const middleY = target.y + (target.height - size.height) / 2;
  const middleX = target.x + (target.width - size.width) / 2;
  const sides: Record<Side, Resolved> = {
    left: { x: target.x - gap - size.width, y: middleY },
    right: { x: target.x + target.width + gap, y: middleY },
    above: { x: middleX, y: target.y - gap - size.height },
    below: { x: middleX, y: target.y + target.height + gap },
  };
  return sides[placement.side];
}

function aligned(target: Box, edge: Edge, size: { width: number; height: number }, current: Box) {
  const edges: Record<Edge, Resolved> = {
    left: { x: target.x, y: current.y },
    center: { x: target.x + (target.width - size.width) / 2, y: current.y },
    right: { x: target.x + target.width - size.width, y: current.y },
    top: { x: current.x, y: target.y },
    middle: { x: current.x, y: target.y + (target.height - size.height) / 2 },
    bottom: { x: current.x, y: target.y + target.height - size.height },
  };
  return edges[edge];
}

/** The first spot, reading left to right and top to bottom, clear of what the region holds. */
function freeSpotInside(
  index: CanvasIndex,
  region: Box & { id: string },
  size: { width: number; height: number },
  self: string
) {
  const held = index
    .contents(region.id)
    .filter((item) => item.id !== self)
    .flatMap((item) => ("width" in item ? [item as Box] : []));
  const step = DEFAULT_GAP / 2;
  for (let y = region.y + INSET; y + size.height <= region.y + region.height - INSET / 2; y += step)
    for (
      let x = region.x + INSET;
      x + size.width <= region.x + region.width - INSET / 2;
      x += step
    ) {
      const spot = {
        x: x - CLEARANCE,
        y: y - CLEARANCE,
        width: size.width + CLEARANCE * 2,
        height: size.height + CLEARANCE * 2,
      };
      if (!held.some((other) => intersects(spot, other))) return { x, y };
    }
  throw new DomainError(
    `"${label(index.find(region.id))}" has no clear space for a ${size.width}×${size.height} item; resize it or place the item exactly.`
  );
}

/** Where a new item goes when no place is given: to the right of everything there is. */
export function defaultSpot(index: CanvasIndex) {
  const bounds = index.bounds();
  if (!bounds) return { x: 0, y: 0 };
  return { x: bounds.x + bounds.width + DEFAULT_GAP * 2, y: bounds.y };
}
