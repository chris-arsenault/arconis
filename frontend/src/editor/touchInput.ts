import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "./controller";
import { openMenu } from "./ui";
import { cellAt, panWithPointer } from "./pointerButtons";
import { historyEntries } from "./history";

/** How long a finger rests before the ring and menu open, and how far it may drift meanwhile. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;
/** How close together fingers must land to count as one tap with several fingers. */
const MULTI_TAP_MS = 300;

/**
 * Fingers and pens on the canvas. A finger on empty canvas drags the view and a long press opens
 * the ring and menu; two fingers tapping undo and three redo, naming what changed; a pen on empty
 * canvas draws, whatever tool is in hand, and the tool returns when the stroke ends.
 */
export function bindTouchInput(
  editor: EditorController,
  session: RoomSession,
  signal: AbortSignal
) {
  const { element } = editor;
  let fingers = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let penTool: string | null = null;
  const tapped = () => {
    const count = fingers;
    fingers = 0;
    tapTimer = null;
    if (count === 2 || count === 3) {
      const { undo, redo } = historyEntries(editor.document);
      const label = count === 2 ? undo[0] : redo[0];
      if (!label) return;
      if (count === 2) editor.document.undo.undo();
      else editor.document.undo.redo();
      session.setNotice(`${count === 2 ? "Undid" : "Redid"}: ${label.toLowerCase()}`);
    }
  };
  const onEmptyCanvas = (event: PointerEvent) => editor.tool === "select" && !cellAt(editor, event);
  const finger = (event: PointerEvent) => {
    fingers++;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(tapped, MULTI_TAP_MS);
    if (fingers === 1 && onEmptyCanvas(event)) fingerOnCanvas(editor, event);
  };
  const pen = (event: PointerEvent) => {
    if (!onEmptyCanvas(event)) return;
    penTool = editor.tool;
    editor.setTool(editor.drawing.destination);
  };
  // On the window, capturing, so the choice of tool lands before the canvas's own listeners.
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (editor.presenter.active || !(event.target instanceof Node)) return;
      if (!element.contains(event.target)) return;
      if (event.pointerType === "touch") finger(event);
      else if (event.pointerType === "pen") pen(event);
    },
    { signal, capture: true }
  );
  window.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerType === "pen" && penTool !== null) {
        editor.setTool("select");
        penTool = null;
      }
    },
    { signal }
  );
}

/** One finger on empty canvas: a drag pans, a rest opens the ring and menu where it rests. */
function fingerOnCanvas(editor: EditorController, event: PointerEvent) {
  const origin = { x: event.clientX, y: event.clientY };
  const press = setTimeout(() => {
    const bounds = editor.element.getBoundingClientRect();
    openMenu(editor, {
      at: { x: origin.x - bounds.left, y: origin.y - bounds.top },
      world: editor.worldPoint(event),
      wedge: null,
      subRing: null,
      ring: true,
    });
  }, LONG_PRESS_MS);
  const cancel = (moveEvent: PointerEvent) => {
    if (Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) > LONG_PRESS_SLOP)
      clearTimeout(press);
  };
  const done = () => {
    clearTimeout(press);
    editor.element.removeEventListener("pointermove", cancel);
    window.removeEventListener("pointerup", done);
  };
  editor.element.addEventListener("pointermove", cancel);
  window.addEventListener("pointerup", done);
  panWithPointer(editor, event);
}
