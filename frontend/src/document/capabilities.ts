import { isLockedIcon } from "./geometry";
import { isBox, isFrame, type Item } from "./types";
import { isMarkup } from "./ink";

/** A separator is a bare rule: it draws no text and has nothing to fill. */
const isSeparator = (item: Item) => item.type === "node" && item.stencil === "separator";
export const hasText = (item: Item) =>
  item.type !== "drawing" && item.type !== "highlight" && !isSeparator(item);
export const hasSubtitle = (item: Item) =>
  ["node", "card", "band"].includes(item.type) && !item.onLine && !isSeparator(item);
export const hasFill = (item: Item) =>
  (isBox(item) || (item.type === "drawing" && item.look.closed === true)) &&
  item.type !== "text" &&
  item.type !== "picture" &&
  !isSeparator(item) &&
  !(item.type === "node" && item.stencil === "icon");
export const hasLine = (item: Item) =>
  item.type !== "note" &&
  item.type !== "text" &&
  !(item.type === "node" && item.stencil === "icon");
export const canColorIcon = (item: Item) => item.icon.startsWith("lucide:");
/** Captions and container titles cannot resize the object they describe. */
export const textCanResize = (item: Item) =>
  !item.wood &&
  (["text", "note", "card"].includes(item.type) ||
    (item.type === "node" && !["icon", "junction", "separator"].includes(item.stencil)));
export const canRotate = (item: Item) =>
  !isFrame(item) && item.type !== "slide" && !isLockedIcon(item);
/** Numeric dimension controls preserve these objects' aspect ratio. */
export const keepsAspectOnResize = (item: Item) => isLockedIcon(item) || item.type === "slide";
/** Collective transforms historically preserve picture dimensions as well as vendor icons. */
export const keepsAspectOnTransform = (item: Item) => isLockedIcon(item) || item.type === "picture";

/**
 * Ordinary placement excludes annotations. A slide is a
 * viewport over the canvas, so it holds nothing.
 */
export const canHoldWorkspace = (item: Item) =>
  isBox(item) && !item.markup && !["band", "highlight", "slide"].includes(item.type);

/** Nothing can be inside a slide; a record naming one as its holder is read as top level. */
export const canHoldAnything = (type: unknown) => type !== "slide";

export const canConnect = (item: Item) => !isMarkup(item);
