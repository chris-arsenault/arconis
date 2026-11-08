import type { RubberBandHandler } from "@maxgraph/core";
import type { EditorController } from "./controller";
import { cellAt } from "./input";
import { closeMenu, openMenu, runCommand } from "./registry";
import { commandContext } from "./registry";
import { ringEntries } from "./contextMenu";

/**
 * The standard mapping: the left button selects, moves and marquees; the middle button drags the
 * view; the right button opens the command ring and context menu, and dragging past the dead
 * zone strokes a wedge of the ring. maxGraph never sees the middle or right button.
 */

/** How far the right button moves before a press becomes a stroke, in pixels. */
export const DEAD_ZONE = 6;
/** The ring's radius to the middle of its wedges, in pixels, for stroke angles. */
export const RING_RADIUS = 56;

/** The wedge, clockwise from the top, that a stroke from the ring's centre points at. */
export function wedgeAt(dx: number, dy: number, count: number) {
  const angle = Math.atan2(dx, -dy);
  const turn = ((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * count;
  return Math.floor((turn + 0.5) % count);
}

/** Marquees start on the left button only; the others belong to the view and the menu. */
export function configureButtons(band: RubberBandHandler) {
  const mouseDown = band.mouseDown.bind(band);
  band.mouseDown = (sender, me) => {
    if (me.getEvent().button === 0) mouseDown(sender, me);
  };
}

/** Drags the view with whatever pointer pressed, until it lifts. */
export function panWithPointer(editor: EditorController, event: PointerEvent) {
  const { element, graph } = editor;
  event.preventDefault();
  event.stopPropagation();
  element.setPointerCapture(event.pointerId);
  let last = { x: event.clientX, y: event.clientY };
  const move = (moveEvent: PointerEvent) => {
    const { scale, translate } = graph.view;
    graph.view.setTranslate(
      translate.x + (moveEvent.clientX - last.x) / scale,
      translate.y + (moveEvent.clientY - last.y) / scale
    );
    last = { x: moveEvent.clientX, y: moveEvent.clientY };
  };
  const finish = () => {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    editor.emit();
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

/** A right press selects what is under it, as the field does, and opens the ring and menu there. */
function selectUnderPointer(editor: EditorController, event: PointerEvent) {
  const cell = cellAt(editor, event);
  const item = cell?.id ? editor.document.get(cell.id) : null;
  if (item && !editor.selected().some((selected) => selected.id === item.id))
    editor.select(item.id);
}

function menuWithRightButton(editor: EditorController, event: PointerEvent) {
  const { element } = editor;
  event.preventDefault();
  event.stopPropagation();
  if (editor.ui.menu) closeMenu(editor);
  selectUnderPointer(editor, event);
  const bounds = element.getBoundingClientRect();
  const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  openMenu(editor, { at, world: editor.worldPoint(event), wedge: null, subRing: null });
  element.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    const menu = editor.ui.menu;
    if (!menu) return;
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    const count = ringEntries(commandContext(editor), menu.subRing).length;
    const wedge = Math.hypot(dx, dy) < DEAD_ZONE ? null : wedgeAt(dx, dy, count);
    if (wedge !== menu.wedge) {
      menu.wedge = wedge;
      editor.emit();
    }
  };
  const finish = () => {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    const menu = editor.ui.menu;
    if (!menu || menu.wedge === null) return;
    const entry = ringEntries(commandContext(editor), menu.subRing)[menu.wedge];
    if (!entry) {
      menu.wedge = null;
      editor.emit();
      return;
    }
    if (entry.opens) {
      menu.subRing = entry.id;
      menu.wedge = null;
      editor.emit();
      return;
    }
    closeMenu(editor);
    runCommand(editor, entry.id);
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

export function bindPointerButtons(editor: EditorController, signal: AbortSignal) {
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      if (editor.presenter.active || editor.editId) return;
      if (event.button === 1) panWithPointer(editor, event);
      else if (event.button === 2) menuWithRightButton(editor, event);
    },
    { signal, capture: true }
  );
  // The browser's own menu never shows over the canvas; the page's menu takes its place.
  editor.element.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
}
