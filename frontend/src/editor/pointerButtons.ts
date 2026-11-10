import { InternalEvent, type CellState, type RubberBandHandler } from "@maxgraph/core";
import type { EditorController } from "./controller";
import { closeMenu, openMenu } from "./ui";
import { commandContext } from "./registry";
import { isUnderlay } from "./templates";
import {
  chooseRingEntry,
  chooseRingMode,
  MODE_WEDGE,
  ringEntries,
  RING_MODES,
} from "./contextMenu";
import { syncZoom } from "./zoom";

/** The object under a pointer, including its label and indicators, excluding template underlays. */
export function cellAt(editor: EditorController, event: MouseEvent) {
  const owner = metadataOwner(editor, event.target);
  if (owner) return owner;
  if (event.target instanceof Node) {
    for (const [cell, state] of editor.graph.view.states)
      if (!isUnderlay(cell) && state.text?.node?.contains(event.target)) return cell;
  }
  const bounds = editor.element.getBoundingClientRect();
  const x = event.clientX - bounds.left + editor.element.scrollLeft;
  const y = event.clientY - bounds.top + editor.element.scrollTop;
  return editor.graph.getCellAt(
    x,
    y,
    null,
    true,
    true,
    (state: CellState) =>
      isUnderlay(state.cell) || editor.document.get(state.cell.id ?? "")?.type === "highlight"
  );
}

function metadataOwner(editor: EditorController, target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const id = target.closest<HTMLElement>(".object-metadata")?.dataset.objectId;
  const cell = id ? editor.graph.getDataModel().getCell(id) : null;
  return cell && !isUnderlay(cell) ? cell : null;
}

/**
 * The standard mapping: the left button selects, moves and marquees; the middle button drags the
 * view; a right click opens the context menu, and holding or dragging the right button brings the
 * command ring, where dragging into a visible wedge chooses it. maxGraph never sees the middle
 * or right button.
 */

/** How far the right button moves before a press becomes a stroke, in pixels. */
export const DEAD_ZONE = 6;
/** How long after a right release the browser's own menu, fired on release, stays suppressed. */
const CONTEXT_MENU_GRACE_MS = 500;
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

/**
 * Ends a right-button gesture. A stroke, once dragged, either chooses the wedge or mode it ends on
 * or cancels; a button held still and released in the centre leaves the menu for a click.
 */
function releaseRing(editor: EditorController, event: PointerEvent, dragged: boolean) {
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
  const entry =
    menu.wedge === null ? null : ringEntries(commandContext(editor), menu.subRing)[menu.wedge];
  if (entry) {
    chooseRingEntry(editor, entry);
    return;
  }
  if (dragged) {
    closeMenu(editor);
    return;
  }
  // Held still and released on the centre: the ring folds away and the menu stays for a click.
  Object.assign(menu, { ring: false, wedge: null });
  editor.emit();
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

function menuWithRightButton(editor: EditorController, event: PointerEvent, onEnd: () => void) {
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
  let dragged = false;
  const move = (moveEvent: PointerEvent) => {
    const menu = editor.ui.menu;
    if (!menu) return;
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    if (Math.hypot(dx, dy) >= DEAD_ZONE) {
      dragged = true;
      showRing();
    }
    if (menu.ring) trackRing(editor, moveEvent);
  };
  const finish = (finishEvent: PointerEvent) => {
    clearTimeout(hold);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    onEnd();
    if (finishEvent.type === "pointercancel") {
      closeMenu(editor);
      return;
    }
    releaseRing(editor, finishEvent, dragged);
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
  // From a right press on the canvas until just after its release, wherever the release lands.
  let gestureUntil = 0;
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      if (editor.presenter.active || editor.editId) return;
      if (event.button === 1) panWithPointer(editor, event);
      else if (event.button === 2) {
        gestureUntil = Infinity;
        menuWithRightButton(editor, event, () => {
          gestureUntil = performance.now() + CONTEXT_MENU_GRACE_MS;
        });
      }
    },
    { signal, capture: true }
  );
  // The browser's own menu never shows over the canvas; the page's menu takes its place. Browsers
  // fire contextmenu on press or on release, and a stroke can be released anywhere, so a right
  // gesture that began on the canvas, the canvas area and an open menu all count, while typing
  // keeps the browser's.
  window.addEventListener(
    "contextmenu",
    (event) => {
      if (editor.editId) return;
      const area = editor.element.parentElement ?? editor.element;
      const overCanvas = event.target instanceof Node && area.contains(event.target);
      const gesture = performance.now() < gestureUntil;
      if (overCanvas || gesture || editor.ui.menu !== null) event.preventDefault();
    },
    { signal, capture: true }
  );
}
