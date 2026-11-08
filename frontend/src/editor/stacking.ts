import { compareStacking } from "../document/geometry";
import { LOCAL } from "../document/types";
import type { EditorController } from "./controller";

/** Moves the selection above or below everything else in the room, as one undo step. */
export function stackSelection(editor: EditorController, direction: "front" | "back") {
  const { document } = editor;
  const selected = [...editor.selected()].sort(compareStacking);
  if (!selected.length) return;
  const orders = document.list().map((item) => item.order);
  const base =
    direction === "front" ? Math.max(...orders) + 1 : Math.min(...orders) - selected.length;
  document.undo.stopCapturing();
  document.doc.transact(() => {
    selected.forEach((item, index) => document.patch(item.id, { order: base + index }));
  }, LOCAL);
  document.undo.stopCapturing();
}
