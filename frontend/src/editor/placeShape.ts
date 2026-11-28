import type { EditorController } from "./controller";
import type { Item, ItemType } from "../document/types";
import { newSlideValues } from "../document/slides";
import { shapeItem, newItemFields, type Shape } from "./shapes";
import { keepsTool } from "./stickyTool";
import { containerAt } from "./panels";
import { placedFactor, windowCentre } from "./creationScale";
export function placeShape(
  editor: EditorController,
  shape: Shape,
  at: { x: number; y: number; anchor: "corner" | "center" } | null,
  icon: EditorController["armedIcon"],
  screen: EditorController["armedScreen"]
) {
  const centre = windowCentre(editor);
  const size = placedFactor(editor, at);
  const offset = (editor.document.items.size % 6) * 16 * size;
  const { type } = shapeItem(shape);
  const fields = newItemFields(shape, size, icon, screen, slideValues(editor, type));
  const position = at ?? {
    x: centre.x + (offset - 80) * size,
    y: centre.y + (offset - 45) * size,
    anchor: "corner",
  };
  const left = position.x - (position.anchor === "center" ? fields.width / 2 : 0);
  const top = position.y - (position.anchor === "center" ? fields.height / 2 : 0);
  const id = editor.document.create(type, left, top, {
    ...fields,
    inside: containerAt(editor.document, position.x, position.y, fields),
  });
  editor.select(id);
  if (!at || !keepsTool(editor)) editor.setTool("select");
  return id;
}

/** A new slide's deck, number, place at the back and, in an existing deck, that deck's size. */
function slideValues(editor: EditorController, type: ItemType): Partial<Item> {
  if (type !== "slide") return {};
  const values = newSlideValues(editor.document.list(), editor.selected(), editor.lastDeck);
  editor.lastDeck = values.deck ?? "";
  return values;
}
