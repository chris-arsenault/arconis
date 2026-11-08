import { STENCILS, typeLabel, type Item, type ItemType, type Stencil } from "../document/types";
import type { ScreenSize } from "../document/screens";
import { creationOffset, creationSize } from "./zoom";

/** What a click on the canvas makes: a node of a stencil, or an item of another type. */
export type Shape = Stencil | "note" | "text" | "frame" | "slide";
export type Tool = Shape | "select" | "pan" | "draw" | "connect";

/** The type and stencil a shape makes. */
export function shapeItem(shape: Shape): { type: ItemType; stencil: Stencil } {
  if ((STENCILS as readonly string[]).includes(shape))
    return { type: "node", stencil: shape as Stencil };
  return { type: shape as ItemType, stencil: "rectangle" };
}

export function defaultName(shape: Shape) {
  return shape === "note" ? "Your idea here" : typeLabel(shapeItem(shape));
}

/**
 * The world size of a new item at this zoom, or of a screen when one is chosen, or a slide's deck
 * size when the deck already has one.
 */
export function newItemSize(
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
