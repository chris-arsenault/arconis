import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import type { EditorController } from "./controller";
import type { CommandDefinition as Command } from "./registry";
import { jumpTo } from "./topics";

/**
 * The room's opening view: one jump point everyone's view starts on when they enter without a
 * link to somewhere else. With none set, a room opens at the origin.
 */

/** Makes an object the one the room opens on, marking it as a jump point; "" clears it. */
export function setOpeningView(document: CanvasDocument, id: string) {
  document.undo.stopCapturing();
  document.doc.transact(() => {
    if (id) document.patch(id, { jump: true });
    document.setOpening(id);
  }, LOCAL);
  document.undo.stopCapturing();
}

/** How long entering a room waits for its content to arrive from peers before giving up. */
const ARRIVAL_WAIT_MS = 30000;

/**
 * Takes the view where entering the room should: to the item a link names, selected and ringed,
 * once it is in the document; otherwise to the room's opening view as the content first arrives.
 * A later change of the opening view does not move someone already in the room.
 */
export function openRoomView(editor: EditorController, linked: string) {
  const { document } = editor;
  let done = false;
  const arrive = () => {
    if (done) return;
    if (linked) {
      if (!document.get(linked)) return;
      jumpTo(editor, linked);
      editor.ui.pulse = linked;
      editor.emit();
    } else {
      if (!document.items.size) return;
      const opening = document.opening();
      if (opening) {
        jumpTo(editor, opening);
        // The view goes there; the newcomer is not handed a selection.
        editor.graph.clearSelection();
      }
    }
    done = true;
    stop();
  };
  const stop = () => {
    document.doc.off("update", arrive);
    clearTimeout(timer);
  };
  const timer = setTimeout(stop, ARRIVAL_WAIT_MS);
  document.doc.on("update", arrive);
  arrive();
  return stop;
}

export const OPENING_COMMAND: Command = {
  id: "fields.opening",
  label: ({ editor, selected }) =>
    selected[0]?.id === editor.document.opening()
      ? "Stop opening the room here"
      : "Open the room here",
  help: "Start everyone's view on this object when they enter the room; it is listed as a jump point.",
  group: "fields",
  keywords: ["default view", "home", "start", "landing", "viewpoint"],
  when: ({ selected }) => selected.length === 1,
  run: ({ editor, selected }) => {
    const [item] = selected;
    setOpeningView(editor.document, item.id === editor.document.opening() ? "" : item.id);
  },
};
