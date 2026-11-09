import { InternalEvent, type RubberBandHandler } from "@maxgraph/core";
import type { EditorController } from "./controller";
import { cellAt } from "./input";
import { closeMenu, openMenu } from "./registry";
import { commandContext } from "./registry";
import {
  chooseRingEntry,
  chooseRingMode,
  MODE_WEDGE,
  ringEntries,
  RING_MODES,
} from "./contextMenu";
import { syncZoom } from "./zoom";

/**
 * The standard mapping: the left button selects, moves and marquees; the middle button drags the
 * view; a right click opens the context menu, and holding or dragging the right button brings the
 * command ring, where dragging into a visible wedge chooses it. maxGraph never sees the middle
 * or right button.
 */

/** How far the right button moves before a press becomes a stroke, in pixels. */
export const DEAD_ZONE = 6;
/** How long the right button rests before the ring appears around the pointer. */
export const RING_HOLD_MS = 250;
/** The ring's radius to the middle of its wedges, in pixels, for stroke angles. */
export const RING_RADIUS = 84;
/** The visible and interactive bounds of every ring, including its neutral centre. */
export const RING_INNER = 48;
export const RING_OUTER = 120;
export const RING_COUNT = 8;
/** The Mode wedge's arc sits just outside the ring, centred on that wedge, one segment per mode. */
export const MODE_INNER = 126;
export const MODE_OUTER = 172;
export const MODE_SPAN = Math.PI / 6;

/** The first mode segment's starting angle, clockwise from the top, so the arc centres on its wedge. */
export function modeArcStart() {
  return (MODE_WEDGE * Math.PI * 2) / RING_COUNT - (MODE_SPAN * RING_MODES.length) / 2;
}

/** The mode segment under a pointer relative to the ring's centre, or null. */
export function modeAt(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (distance < MODE_INNER || distance > MODE_OUTER) return null;
  const angle = Math.atan2(dx, -dy);
  const turn = (angle < 0 ? angle + Math.PI * 2 : angle) - modeArcStart();
  const index = Math.floor(turn / MODE_SPAN);
  return index >= 0 && index < RING_MODES.length ? index : null;
}

/** The clamped centre used by both the rendered ring and a held pointer's hit test. */
export function ringCentre(at: { x: number; y: number }, width: number, height: number) {
  const half = MODE_OUTER + 2;
  return {
    x: Math.max(8 + half, Math.min(at.x, width - half - 8)),
    y: Math.max(8 + half, Math.min(at.y, height - half - 8)),
  };
}

/** The visible wedge under a pointer relative to the ring's centre, clockwise from the top. */
export function wedgeAt(
  dx: number,
  dy: number,
  count: number,
  inner = RING_INNER,
  outer = RING_OUTER
) {
  const distance = Math.hypot(dx, dy);
  if (distance < inner || distance > outer) return null;
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
  let dx = 0;
  let dy = 0;
  const move = (moveEvent: PointerEvent) => {
    dx = moveEvent.clientX - event.clientX;
    dy = moveEvent.clientY - event.clientY;
    graph.panGraph(dx, dy);
  };
  const finish = () => {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    graph.panGraph(0, 0);
    const { scale, translate } = graph.view;
    graph.view.setTranslate(translate.x + dx / scale, translate.y + dy / scale);
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

/** A right press selects what is under it, as the field does, and opens the ring and menu there. */
function selectUnderPointer(editor: EditorController, event: PointerEvent) {
  const cell = cellAt(editor, event);
  const item = cell?.id ? editor.document.get(cell.id) : null;
  if (!item) {
    editor.graph.clearSelection();
    return;
  }
  if (item && !editor.selected().some((selected) => selected.id === item.id))
    editor.select(item.id);
}

function releaseRing(editor: EditorController, event: PointerEvent) {
  const menu = editor.ui.menu;
  if (!menu?.ring) return;
  const area = editor.element.getBoundingClientRect();
  const centre = ringCentre(menu.at, area.width, area.height);
  const mode = menu.modes
    ? modeAt(event.clientX - area.left - centre.x, event.clientY - area.top - centre.y)
    : null;
  if (mode !== null) {
    chooseRingMode(editor, RING_MODES[mode]);
    return;
  }
  if (menu.wedge === null) {
    // Released on the centre: the ring folds away and the menu stays for a click.
    menu.ring = false;
    editor.emit();
    return;
  }
  const entry = ringEntries(commandContext(editor), menu.subRing)[menu.wedge];
  if (entry) chooseRingEntry(editor, entry);
  else {
    menu.wedge = null;
    editor.emit();
  }
}

/**
 * Follows a held pointer over the ring: the wedge under it, and the Mode arc's segment once
 * resting on the Mode wedge has revealed the arc. The ring's own wedges never change on the way.
 */
function trackRing(editor: EditorController, event: PointerEvent) {
  const menu = editor.ui.menu!;
  const area = editor.element.getBoundingClientRect();
  const centre = ringCentre(menu.at, area.width, area.height);
  const px = event.clientX - area.left - centre.x;
  const py = event.clientY - area.top - centre.y;
  const wedge = wedgeAt(px, py, RING_COUNT);
  const entry = wedge === null ? null : ringEntries(commandContext(editor), menu.subRing)[wedge];
  const modes = Boolean(menu.modes || entry?.modes);
  const mode = modes ? modeAt(px, py) : null;
  if (wedge === menu.wedge && modes === Boolean(menu.modes) && mode === (menu.mode ?? null)) return;
  Object.assign(menu, { wedge, modes, mode });
  editor.emit();
}

function menuWithRightButton(editor: EditorController, event: PointerEvent) {
  const { element } = editor;
  event.preventDefault();
  event.stopPropagation();
  if (editor.ui.menu) closeMenu(editor);
  selectUnderPointer(editor, event);
  const bounds = element.getBoundingClientRect();
  const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  openMenu(editor, {
    at,
    world: editor.worldPoint(event),
    wedge: null,
    subRing: null,
    ring: false,
  });
  element.setPointerCapture(event.pointerId);
  // A click is the menu alone; resting or moving the held button brings the ring around it.
  const showRing = () => {
    const menu = editor.ui.menu;
    if (menu && !menu.ring) {
      menu.ring = true;
      editor.emit();
    }
  };
  const hold = setTimeout(showRing, RING_HOLD_MS);
  const move = (moveEvent: PointerEvent) => {
    const menu = editor.ui.menu;
    if (!menu) return;
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    if (Math.hypot(dx, dy) >= DEAD_ZONE) showRing();
    if (menu.ring) trackRing(editor, moveEvent);
  };
  const finish = (finishEvent: PointerEvent) => {
    clearTimeout(hold);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (finishEvent.type === "pointercancel") {
      closeMenu(editor);
      return;
    }
    releaseRing(editor, finishEvent);
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}

export function bindPointerButtons(editor: EditorController, signal: AbortSignal) {
  const preview = () => {
    const dx = editor.graph.getPanDx();
    const dy = editor.graph.getPanDy();
    const overlays = editor.element.parentElement?.querySelectorAll<HTMLElement>(
      ".selection-frame, .contextual-tools, .selection-popover, .text-overflow-indicator, .gradient-direction, .cursors, .find-pulse, .comment-modal, .quick-create, .measure, :scope > .laser"
    );
    overlays?.forEach((node) => {
      node.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
    });
    syncZoom(editor.graph, editor.element);
  };
  editor.graph.addListener(InternalEvent.PAN, preview);
  signal.addEventListener("abort", () => editor.graph.removeListener(preview), { once: true });
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      if (editor.presenter.active || editor.editId) return;
      if (event.button === 1) panWithPointer(editor, event);
      else if (event.button === 2) menuWithRightButton(editor, event);
    },
    { signal, capture: true }
  );
  // The browser's own menu never shows over the canvas; the page's menu takes its place. Browsers
  // fire contextmenu on release as well as on press, by which time the ring sits under the
  // pointer, so the whole canvas area and an open ring count, while typing keeps the browser's.
  window.addEventListener(
    "contextmenu",
    (event) => {
      if (editor.editId) return;
      const area = editor.element.parentElement ?? editor.element;
      const overCanvas = event.target instanceof Node && area.contains(event.target);
      if (overCanvas || editor.ui.menu !== null) event.preventDefault();
    },
    { signal, capture: true }
  );
}
