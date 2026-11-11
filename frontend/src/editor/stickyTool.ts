import type { EditorController } from "./controller";

/**
 * Keeping a tool in hand: while it is on, placing an object leaves its tool armed, so several of
 * one kind go down in a row. Escape puts the tool away and turns it off.
 */

/** The key that turns keeping the tool in hand on and off. */
export const STICKY_KEY = "q";

const kept = new WeakSet<EditorController>();

/** Whether placing an object now leaves its tool in hand. */
export function keepsTool(editor: EditorController) {
  return kept.has(editor);
}

export function setKeepsTool(editor: EditorController, keep: boolean) {
  if (keep === kept.has(editor)) return;
  if (keep) kept.add(editor);
  else kept.delete(editor);
  editor.element.dataset.keepsTool = String(keep);
  editor.emit();
}
