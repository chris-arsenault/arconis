import type { Item, Look } from "../document/types";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Space between items placed beside one another when no gap is given. */
export const DEFAULT_GAP = 40;
/** Room between a frame's edge and what it holds. */
export const FRAME_PADDING = 24;
/** Room for a frame's title, by where the title sits. */
const TITLE_ROOM = { header: 40, top: 32, side: 40 };
/** Room above a band's contents for its title and subtitle. */
export const BAND_TITLE_ROOM = 44;
/** Rough text measures, enough to keep labels under icons from colliding. */
const CHARACTER_WIDTH = 0.6;
const LINE_HEIGHT = 1.35;
const DEFAULT_TEXT_SIZE = 12;

/** Whether an item's text sits under its box rather than inside it. */
function labelBelow(item: Item) {
  return (item.type === "node" && item.stencil === "icon") || item.type === "picture";
}

/**
 * The space an item takes on the canvas: its box, and for icons and pictures, their labels below.
 * Placing items by footprint keeps a label from running into the item under it.
 */
export function footprint(item: Item, look: Look = item.look): Box {
  if (!labelBelow(item) || (!item.name && !item.subtitle)) return boxOf(item);
  const size = (look.textSize ?? DEFAULT_TEXT_SIZE) * (look.scale ?? 1);
  const longest = Math.max(item.name.length, item.subtitle.length);
  const width = Math.max(item.width, longest * size * CHARACTER_WIDTH + size);
  const lines = (item.name ? 1 : 0) + (item.subtitle ? 1 : 0);
  return {
    x: item.x - (width - item.width) / 2,
    y: item.y,
    width,
    height: item.height + lines * size * LINE_HEIGHT + size / 2,
  };
}

export function boxOf({ x, y, width, height }: Box): Box {
  return { x, y, width, height };
}

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export interface Padding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Room inside a holder around what it holds. */
export function paddingOf(item: Item, look: Look): Padding {
  const scale = look.scale ?? 1;
  const pad = FRAME_PADDING * scale;
  if (item.type === "frame") {
    const title = look.title ?? "header";
    const room = TITLE_ROOM[title] * scale;
    if (title === "side") return { left: room, right: pad, top: pad, bottom: pad };
    return { left: pad, right: pad, top: room, bottom: pad };
  }
  if (item.type === "group")
    return { left: pad, right: pad, top: TITLE_ROOM.top * scale, bottom: pad };
  return { left: pad, right: pad, top: pad, bottom: pad };
}
