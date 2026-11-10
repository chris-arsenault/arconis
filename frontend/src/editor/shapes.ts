import { STENCILS, typeLabel, type Item, type ItemType, type Stencil } from "../document/types";
import type { ScreenSize } from "../document/screens";
import { creationOffset, creationSize, creationValues } from "./zoom";
import { defaultFields } from "./styleClipboard";

/** What a click on the canvas makes: a node of a stencil, or an item of another type. */
export type Shape = Stencil | "note" | "text" | "frame" | "slide";
export type Tool = Shape | "select" | "pan" | "draw" | "markup" | "connect";

/** The type and stencil a shape makes. */
export function shapeItem(shape: Shape): { type: ItemType; stencil: Stencil } {
  if ((STENCILS as readonly string[]).includes(shape))
    return { type: "node", stencil: shape as Stencil };
  return { type: shape as ItemType, stencil: "rectangle" };
}

function defaultName(shape: Shape) {
  return shape === "note" ? "Your idea here" : typeLabel(shapeItem(shape));
}

/**
 * The world size of a new item at this zoom, or of a screen when one is chosen, or a slide's deck
 * size when the deck already has one.
 */
function newItemSize(
  shape: Shape,
  scale: number,
  screen: ScreenSize | null,
  given: Partial<Pick<Item, "width" | "height">> = {}
) {
  if (given.width && given.height) return { width: given.width, height: given.height };
  const { type, stencil } = shapeItem(shape);
  if (!screen) return creationSize(type, scale, stencil);
  const factor = creationOffset(scale);
  return { width: screen.width * factor, height: screen.height * factor };
}

/** Creation combines this person's defaults with zoom sizing, keeping both appearance policies. */
export function newItemFields(
  shape: Shape,
  scale: number,
  icon: { key: string; title: string } | null,
  screen: ScreenSize | null,
  slide: Partial<Item>
) {
  const { type, stencil } = shapeItem(shape);
  const defaults = defaultFields(type, stencil);
  const sizing = creationValues(type, scale, stencil);
  return {
    name: screen?.name ?? icon?.title ?? defaultName(shape),
    stencil,
    ...defaults,
    ...sizing,
    look: { ...defaults.look, ...sizing.look },
    ...slide,
    ...newItemSize(shape, scale, screen, slide),
    ...(icon ? { icon: icon.key } : {}),
  };
}
