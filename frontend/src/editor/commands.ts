import type { CanvasDocument } from "../document/canvasDocument";
import { authoredLook, effectiveAppearance } from "../document/appearance";
import { keepsAspectOnResize } from "../document/capabilities";
import { routeLineAround } from "../document/routeLine";
import { deckOf, nextSlideNumber, TEMPLATE_NUMBER } from "../document/slides";
import { LOCAL, type Item, type Look } from "../document/types";
import type { EditorController } from "./controller";
import { fittedTextHeight } from "./textLayout";
import type { SourceEdit } from "../text/commands";

/** A control changes the selection as one undoable operation, regardless of item count. */
export function changeSelectionLook(canvas: CanvasDocument, items: Item[], look: Look): void;
export function changeSelectionLook(
  canvas: CanvasDocument,
  items: Item[],
  look: Look,
  resizeText: true
): Promise<void>;
export function changeSelectionLook(
  canvas: CanvasDocument,
  items: Item[],
  look: Look,
  resizeText: false
): void;
export function changeSelectionLook(
  canvas: CanvasDocument,
  items: Item[],
  look: Look,
  resizeText: boolean
): void | Promise<void>;
export function changeSelectionLook(
  canvas: CanvasDocument,
  items: Item[],
  look: Look,
  resizeText = false
) {
  if (resizeText) return changeFittedLook(canvas, items, look);
  commitLook(canvas, items, look);
}

function commitLook(
  canvas: CanvasDocument,
  items: Item[],
  look: Look,
  heights = new Map<string, number>()
) {
  canvas.undo.stopCapturing();
  canvas.doc.transact(
    () =>
      items.forEach((item) => {
        canvas.patchLook(item.id, look);
        const height = heights.get(item.id);
        if (height !== undefined) canvas.patch(item.id, { height });
      }),
    LOCAL
  );
  canvas.undo.stopCapturing();
}

async function changeFittedLook(canvas: CanvasDocument, items: Item[], look: Look) {
  await document.fonts.ready;
  const current = items.map((item) => canvas.get(item.id)).filter((item) => item !== null);
  const heights = new Map<string, number>();
  for (const item of current) {
    const future = { ...item, look: { ...item.look } };
    for (const key of Object.keys(look) as (keyof Look)[]) {
      if (look[key] === undefined) delete future.look[key];
      else Object.assign(future.look, { [key]: look[key] });
    }
    const appearance = effectiveAppearance(future, canvas.namedStyle(item.style));
    const height = fittedTextHeight(future, appearance, true);
    if (height !== null) heights.set(item.id, height);
  }
  commitLook(canvas, current, look, heights);
}

/** Sets fields such as lock, tags or a task on each item, as one undoable operation. */
export function changeFields(canvas: CanvasDocument, ids: string[], values: Partial<Item>) {
  if (!ids.length) return;
  canvas.undo.stopCapturing();
  canvas.doc.transact(() => ids.forEach((id) => canvas.patch(id, values)), LOCAL);
  canvas.undo.stopCapturing();
}

export function changeSelectionStyle(canvas: CanvasDocument, items: Item[], style: string) {
  canvas.undo.stopCapturing();
  canvas.doc.transact(() => items.forEach((item) => canvas.patch(item.id, { style })), LOCAL);
  canvas.undo.stopCapturing();
}

/** Numeric sizing adapts the shared aspect policy to the graph's geometry command. */
export function changeGeometry(
  editor: EditorController,
  item: Item,
  key: "x" | "y" | "width" | "height",
  value: number
) {
  if (keepsAspectOnResize(item) && (key === "width" || key === "height")) {
    const other = key === "width" ? "height" : "width";
    editor.updateGeometry(item.id, { [key]: value, [other]: (value * item[other]) / item[key] });
  } else editor.updateGeometry(item.id, { [key]: value });
}

export function routeAround(canvas: CanvasDocument, item: Item) {
  const route = routeLineAround(canvas.list(), item, (other) =>
    authoredLook(other, canvas.namedStyle(other.style))
  );
  if (!route) return;
  canvas.undo.stopCapturing();
  canvas.patch(item.id, route);
  canvas.undo.stopCapturing();
}

export function changeTemplate(canvas: CanvasDocument, item: Item, template: boolean) {
  canvas.patch(item.id, {
    slide: template ? TEMPLATE_NUMBER : nextSlideNumber(canvas.list(), deckOf(item)),
  });
}

/** Canonical source editing owns its document mutation, caret and text-fit follow-up together. */
export function editSource(
  canvas: CanvasDocument,
  id: string,
  element: HTMLTextAreaElement,
  edit: SourceEdit
) {
  const source = element.value;
  element.focus({ preventScroll: true });
  const current = canvas.get(id);
  if (!current) return;
  const value = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  const future = { ...current, name: value };
  // Source/caret updates stay immediate, so fit the currently visible fonts without an async gap.
  const height = fittedTextHeight(
    future,
    effectiveAppearance(future, canvas.namedStyle(current.style)),
    true
  );
  canvas.undo.stopCapturing();
  canvas.doc.transact(() => {
    canvas.editText(id, value);
    if (height !== null) canvas.patch(id, { height });
  }, LOCAL);
  canvas.undo.stopCapturing();
  element.setSelectionRange(edit.anchor, edit.head);
}
