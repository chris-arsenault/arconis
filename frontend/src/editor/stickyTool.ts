import type { EditorController } from "./controller";
import type { CommandDefinition } from "./registry";

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

export const KEEP_TOOL_COMMAND: CommandDefinition = {
  id: "tool.keep",
  label: ({ editor }) =>
    keepsTool(editor) ? "Stop keeping the tool in hand" : "Keep the tool in hand",
  help: "Leave a placing tool armed after each object, to place several in a row. Escape puts it away.",
  group: "tools",
  keywords: ["sticky", "lock tool", "repeat", "stamp", "several"],
  shortcuts: [{ key: STICKY_KEY }],
  run: ({ editor }) => {
    setKeepsTool(editor, !keepsTool(editor));
    editor.room?.setNotice(
      keepsTool(editor)
        ? "Tools stay in hand after placing. Press Q or Escape to stop."
        : "Tools return to Select after placing."
    );
  },
};
