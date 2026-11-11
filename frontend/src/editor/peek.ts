import { worldBounds } from "../document/relations";
import type { View } from "../document/types";
import type { EditorController } from "./controller";
import { isInputTarget } from "./ui";
import { fittingView, flyToView } from "./views";
import { viewportSize } from "./zoom";

/** The key held to look at the whole canvas. */
export const PEEK_KEY = "o";

/** How much of the window the whole canvas fills while peeking. */
const PEEK_FILL = 0.9;
/** How far the pointer must travel during a peek, in pixels, to mean "take me there". */
const POINTING_SLOP = 6;

type Pointer = { clientX: number; clientY: number };

function currentView(editor: EditorController): View {
  const { scale, translate } = editor.graph.view;
  const { width, height } = viewportSize(editor.element);
  return {
    center: { x: width / 2 / scale - translate.x, y: height / 2 / scale - translate.y },
    zoom: scale,
  };
}

/** Whether the pointer went somewhere on the canvas during the peek. */
function moved(from: Pointer | null, to: Pointer | null) {
  if (!to) return false;
  // A pointer that was over a panel when the peek began and is on the canvas now has moved.
  if (!from) return true;
  return Math.hypot(to.clientX - from.clientX, to.clientY - from.clientY) > POINTING_SLOP;
}

/**
 * Holding O zooms out to the whole canvas. Releasing it returns to the zoom held before: at the
 * spot the pointer was moved to, or back where the view was when the pointer stayed put.
 */
export function bindPeek(editor: EditorController, options: { signal: AbortSignal }) {
  let before: { view: View; pointer: Pointer | null } | null = null;
  const start = () => {
    const bounds = worldBounds(editor.document.list());
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const view = currentView(editor);
    before = { view, pointer: editor.pointer };
    const whole = fittingView(bounds, editor.element, PEEK_FILL);
    // A view already wider than the canvas stays as it is; the release still lands at the pointer.
    if (whole.zoom < view.zoom) flyToView(editor.graph, editor.element, whole);
  };
  const land = (atPointer: boolean) => {
    if (!before) return;
    const { view, pointer } = before;
    before = null;
    const pointing = atPointer && editor.pointer && moved(pointer, editor.pointer);
    const center = pointing ? editor.worldPoint(editor.pointer!) : view.center;
    flyToView(editor.graph, editor.element, { center, zoom: view.zoom });
  };
  const isPeekKey = (event: KeyboardEvent) => event.key.toLowerCase() === PEEK_KEY;
  window.addEventListener(
    "keydown",
    (event) => {
      if (!isPeekKey(event) || event.repeat || before || isInputTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || editor.presenter.active) return;
      event.preventDefault();
      start();
    },
    options
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (isPeekKey(event)) land(true);
    },
    options
  );
  window.addEventListener("blur", () => land(false), options);
}
