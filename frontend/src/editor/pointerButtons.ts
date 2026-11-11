import { InternalEvent, type CellState, type RubberBandHandler } from "@maxgraph/core";
import type { EditorController } from "./controller";
import { closeMenu, openMenu } from "./ui";
import { commandContext } from "./registry";
import { isUnderlay } from "./templates";
import { chooseRingEntry, opensRing, ringEntries, type MenuEntry } from "./contextMenu";

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
 * view; a right click opens the context menu when it is released, and holding or dragging the
 * right button brings the command ring instead, where dragging into a visible wedge chooses it.
 * maxGraph never sees the middle or right button.
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
/** How long a held pointer rests on a wedge that opens a ring before that ring opens. */
export const RING_DWELL_MS = 180;

/** The clamped centre used by both the rendered ring and a held pointer's hit test. */
export function ringCentre(at: { x: number; y: number }, width: number, height: number) {
  const half = RING_OUTER + 2;
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
 * Ends a held right-button gesture: it chooses the wedge it ends on, and anywhere else closes
 * the ring.
 */
function releaseRing(editor: EditorController, stroke: Stroke) {
  const menu = editor.ui.menu;
  if (!menu?.ring) return;
  const wedge = menu.wedge;
  const entry =
    wedge === null ? null : ringEntries(commandContext(editor), menu.subRing, menu.back)[wedge];
  if (entry) {
    chooseRingEntry(editor, entry, wedge);
    return;
  }
  // Released where a ring just opened under the pointer: that ring stays for a click.
  if (!stroke.fresh) closeMenu(editor);
}

/** What one held stroke remembers between pointer moves. */
interface Stroke {
  /** The pointer's last place, in canvas-area pixels. */
  at: { x: number; y: number };
  /** Whether the pointer was last inside the ring's outer edge. */
  within: boolean;
  /** The wait before a rested-on wedge opens its ring. */
  dwell: ReturnType<typeof setTimeout> | null;
  /** A wedge a new ring opened under the pointer, which counts only once the pointer leaves it. */
  skip: number | null;
  /** Whether a ring opened under the pointer and the pointer has yet to reach one of its wedges. */
  fresh: boolean;
}

/** The pointer relative to the ring's clamped centre, and the wedge in its direction if any. */
function strokePoint(editor: EditorController, at: { x: number; y: number }) {
  const area = editor.element.getBoundingClientRect();
  const centre = ringCentre(editor.ui.menu!.at, area.width, area.height);
  const dx = at.x - centre.x;
  const dy = at.y - centre.y;
  const distance = Math.hypot(dx, dy);
  return {
    distance,
    wedge: wedgeAt(dx, dy, RING_COUNT),
    toward: distance < RING_INNER ? null : wedgeAt(dx, dy, RING_COUNT, RING_INNER, Infinity),
  };
}

/**
 * Moves a held stroke into the ring a wedge opens, or back out of it. The new ring takes the old
 * one's place, so the pointer is already over the wedge that leads the other way; that wedge
 * waits until the pointer leaves it.
 */
function enterRing(editor: EditorController, stroke: Stroke, entry: MenuEntry, wedge: number) {
  if (stroke.dwell) clearTimeout(stroke.dwell);
  stroke.dwell = null;
  if (!editor.ui.menu?.ring) return;
  chooseRingEntry(editor, entry, wedge);
  const point = strokePoint(editor, stroke.at);
  stroke.skip = point.toward;
  stroke.within = point.distance <= RING_OUTER;
  stroke.fresh = true;
}

/**
 * Follows a held pointer over the ring. The wedge under it lights; a wedge that opens another
 * ring does so in place when the pointer rests on it or strokes out through it, so two levels
 * are one continuous stroke.
 */
function trackRing(editor: EditorController, stroke: Stroke) {
  const menu = editor.ui.menu!;
  const { wedge, through } = advanceStroke(editor, stroke);
  const entries = ringEntries(commandContext(editor), menu.subRing, menu.back);
  const crossed = through === null ? null : entries[through];
  if (crossed && opensRing(crossed)) {
    enterRing(editor, stroke, crossed, through!);
    return;
  }
  if (wedge === menu.wedge) return;
  menu.wedge = wedge;
  editor.emit();
  if (stroke.dwell) clearTimeout(stroke.dwell);
  const entry = wedge === null ? null : entries[wedge];
  stroke.dwell =
    entry && opensRing(entry)
      ? setTimeout(() => enterRing(editor, stroke, entry, wedge!), RING_DWELL_MS)
      : null;
}

/**
 * Brings the stroke's memory up to the pointer: the wedge it is on, and the wedge it has just
 * left the ring through, if it has. A wedge that opened under the pointer counts as neither
 * until the pointer leaves its direction.
 */
function advanceStroke(editor: EditorController, stroke: Stroke) {
  const point = strokePoint(editor, stroke.at);
  if (point.toward !== stroke.skip) stroke.skip = null;
  const waiting = stroke.skip !== null;
  const outside = !waiting && point.distance > RING_OUTER;
  const through = outside && stroke.within ? point.toward : null;
  const wedge = waiting ? null : point.wedge;
  stroke.within = point.distance <= RING_OUTER;
  if (wedge !== null || !stroke.within) stroke.fresh = false;
  return { wedge, through };
}

function menuWithRightButton(editor: EditorController, event: PointerEvent, onEnd: () => void) {
  const { element } = editor;
  event.preventDefault();
  event.stopPropagation();
  if (editor.ui.menu) closeMenu(editor);
  selectUnderPointer(editor, event);
  const bounds = element.getBoundingClientRect();
  const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const world = editor.worldPoint(event);
  const open = (ring: boolean) => openMenu(editor, { at, world, wedge: null, subRing: null, ring });
  element.setPointerCapture(event.pointerId);
  // Nothing shows on the press. Resting or moving the held button brings the ring; a plain
  // click brings the menu when it is released.
  let held = false;
  const showRing = () => {
    if (held) return;
    held = true;
    open(true);
    // A ring held in from the canvas edge opens with a wedge under the pointer, which waits.
    stroke.skip = strokePoint(editor, stroke.at).toward;
  };
  const hold = setTimeout(showRing, RING_HOLD_MS);
  const stroke: Stroke = { at, within: true, dwell: null, skip: null, fresh: false };
  const move = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    if (Math.hypot(dx, dy) >= DEAD_ZONE) showRing();
    stroke.at = { x: moveEvent.clientX - bounds.left, y: moveEvent.clientY - bounds.top };
    if (editor.ui.menu?.ring) trackRing(editor, stroke);
  };
  const finish = (finishEvent: PointerEvent) => {
    clearTimeout(hold);
    if (stroke.dwell) clearTimeout(stroke.dwell);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    onEnd();
    if (finishEvent.type === "pointercancel") {
      closeMenu(editor);
      return;
    }
    if (held) releaseRing(editor, stroke);
    else open(false);
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
      ".selection-frame, .contextual-tools, .selection-popover, .text-overflow-indicator, .gradient-direction, .cursors, .find-pulse, .comment-modal, .quick-create, .measure, .distance-overlay svg, :scope > .laser"
    );
    overlays?.forEach((node) => {
      node.style.translate = dx || dy ? `${dx}px ${dy}px` : "";
    });
    editor.grid.sync();
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
