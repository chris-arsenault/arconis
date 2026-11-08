import { isLockedIcon } from "./geometry";
import { isBox, isFrame, type Item } from "./types";

export const hasText = (item: Item) => item.type !== "drawing";
export const hasSubtitle = (item: Item) =>
  ["node", "card", "band"].includes(item.type) && !item.onLine;
export const hasFill = (item: Item) =>
  isBox(item) &&
  item.type !== "text" &&
  item.type !== "picture" &&
  !(item.type === "node" && item.stencil === "icon");
export const hasLine = (item: Item) =>
  item.type !== "note" &&
  item.type !== "text" &&
  !(item.type === "node" && item.stencil === "icon");
export const canColorIcon = (item: Item) => item.icon.startsWith("lucide:");
/** Captions and container titles cannot resize the object they describe. */
export const textCanResize = (item: Item) =>
  ["text", "note", "card"].includes(item.type) ||
  (item.type === "node" && item.stencil !== "icon" && item.stencil !== "junction");
export const canRotate = (item: Item) =>
  !isFrame(item) && item.type !== "slide" && !isLockedIcon(item);
/** Numeric dimension controls preserve these objects' aspect ratio. */
export const keepsAspectOnResize = (item: Item) => isLockedIcon(item) || item.type === "slide";
/** Collective transforms historically preserve picture dimensions as well as vendor icons. */
export const keepsAspectOnTransform = (item: Item) => isLockedIcon(item) || item.type === "picture";
