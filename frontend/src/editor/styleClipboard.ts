import type { CanvasDocument } from "../document/canvasDocument";
import { authoredLook } from "../document/appearance";
import { LOCAL, type Item, type ItemType, type Look, type Stencil } from "../document/types";

/**
 * Looks carried between items without the document: one copied look to paste, and the looks new
 * items of each kind start with when someone sets a default. Both last as long as the page.
 */

interface CarriedLook {
  style: string;
  look: Look;
}

let copied: CarriedLook | null = null;
const defaults = new Map<string, CarriedLook>();

function kindOf(type: ItemType, stencil: Stencil) {
  return type === "node" ? `node ${stencil}` : type;
}

/** Remembers an item's named style and its own look, to paste onto others. */
export function copyLook(item: Item) {
  copied = { style: item.style, look: { ...item.look } };
}

export function hasCopiedLook() {
  return copied !== null;
}

/** Applies the copied style and look to items, as one undo step; their geometry stays. */
export function pasteLook(canvas: CanvasDocument, items: Item[]) {
  if (!copied) return;
  const { style, look } = copied;
  canvas.undo.stopCapturing();
  canvas.doc.transact(() => {
    for (const item of items) {
      canvas.patch(item.id, { style });
      const cleared = Object.fromEntries(Object.keys(item.look).map((key) => [key, undefined]));
      canvas.patchLook(item.id, { ...cleared, ...look });
    }
  }, LOCAL);
  canvas.undo.stopCapturing();
}

/** Makes an item's look what new items of its kind start with, on this page from now on. */
export function setDefaultLook(canvas: CanvasDocument, item: Item) {
  defaults.set(kindOf(item.type, item.stencil), {
    style: item.style,
    look: authoredLook(item, canvas.namedStyle(item.style)),
  });
}

/** The fields a new item of this kind starts with: nothing, until a default is set. */
export function defaultFields(type: ItemType, stencil: Stencil): Partial<Item> {
  const carried = defaults.get(kindOf(type, stencil));
  if (!carried) return {};
  // A new item's scale follows the zoom it is made at, not the item the default came from.
  const look = { ...carried.look };
  delete look.scale;
  return { style: carried.style, look };
}
