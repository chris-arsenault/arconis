import type { EditorController, Shape } from "./controller";
import { PanningHandler } from "@maxgraph/core";
import { clampScale, creationValues, viewportSize } from "./zoom";
import { bindDrawingInput } from "./drawingInput";
import { commandContext, commandForKey, runCommand } from "./registry";
import { isInputTarget, showComments, showRelate } from "./ui";
import { bindPointerButtons, cellAt, configureButtons } from "./pointerButtons";
import { keepSelectionOnReclick } from "./reselect";
import { scaleOf } from "./creationScale";
import { configureCentredResize, configureCreateTarget } from "./createTarget";
import { nextInStack } from "./selectBy";
import { changeFields } from "./commands";
import { canConnect } from "../document/capabilities";
import { relateTo } from "./topics";
import { bindMarkdownLinks } from "./links";
import { bindInteractionCursors } from "./interactionCursors";
import { TemporaryPan } from "./temporaryPan";
import { bindPeek } from "./peek";
import { keepsTool, setKeepsTool } from "./stickyTool";

/** Enter and Space belong to a keyboard-focused control; other shortcuts still apply. */
function activatesControl(target: EventTarget | null, key: string) {
  return (
    (key === "enter" || key === " ") &&
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a"))
  );
}

/** Tab belongs to the page unless the canvas has focus and something is selected. */
function onCanvas(editor: EditorController, event: KeyboardEvent) {
  return event.target === document.body || editor.element.contains(event.target as Node);
}

/** Whether the canvas's shortcuts apply to this key, rather than a text field or the palette. */
function takesKey(editor: EditorController, event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  // A presentation has its own keys, and nothing is being edited.
  if (editor.presenter.active) return false;
  if (editor.ui.menu || editor.ui.relating || event.defaultPrevented) return false;
  if (isInputTarget(event.target) || activatesControl(event.target, key)) return false;
  const paletteKey = key === "k" && (event.ctrlKey || event.metaKey);
  return !editor.ui.palette || paletteKey;
}

/**
 * Keys run commands from the registry, so a key means the same everywhere it applies. Space is a
 * hold rather than a command, and the palette takes its own keys while it is open.
 */
function keyboard(editor: EditorController, event: KeyboardEvent, pan: TemporaryPan) {
  if (!takesKey(editor, event)) return;
  if (event.key === " " && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    pan.start();
    return;
  }
  if (event.key === "Escape") setKeepsTool(editor, false);
  const command = commandForKey(event, commandContext(editor));
  if (!command || (event.key === "Tab" && !onCanvas(editor, event))) return;
  event.preventDefault();
  runCommand(editor, command.id);
}

/** How far a pointer may move before an Alt click becomes an Alt drag. */
const CLICK_SLOP = 4;

/**
 * An Alt click on stacked objects steps down to the one beneath the selection. It happens on
 * release without movement, so an Alt drag still moves a topic alone as maxGraph has it.
 */
function bindStackCycling(editor: EditorController, options: { signal: AbortSignal }) {
  let down: { clientX: number; clientY: number } | null = null;
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      down = event.altKey && event.button === 0 && editor.tool === "select" ? event : null;
    },
    { ...options, capture: true }
  );
  window.addEventListener(
    "pointerup",
    (event) => {
      if (!down || !event.altKey) return;
      const moved = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
      down = null;
      if (moved > CLICK_SLOP) return;
      const next = nextInStack(editor.document.list(), editor.selected(), editor.worldPoint(event));
      if (next) editor.select(next.id);
    },
    options
  );
}

/** A placed note or text opens for typing, unless its tool stays in hand to place the next one. */
function opensText(editor: EditorController, shape: Shape) {
  return (shape === "note" || shape === "text") && !keepsTool(editor);
}

function bindPointerTools(editor: EditorController, options: { signal: AbortSignal }) {
  let pendingEdit = "";
  bindStackCycling(editor, options);
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      editor.element.focus({ preventScroll: true });
      if (event.button !== 0 || ["select", "pan"].includes(editor.tool)) return;
      event.preventDefault();
      event.stopPropagation();
      if (editor.drawing.active || editor.tool === "measure") return;
      if (editor.tool === "connect") {
        const cell = cellAt(editor, event);
        if (cell?.isVertex())
          editor.connectionSource = connectClick(editor, editor.connectionSource, cell.id!);
      } else {
        const shape = editor.tool as Shape;
        const point = editor.graph.getPointForEvent(event);
        const id = editor.add(shape, { x: point.x, y: point.y, anchor: "corner" });
        if (opensText(editor, shape)) pendingEdit = id;
      }
    },
    { ...options, capture: true }
  );
  window.addEventListener(
    "pointerup",
    () => {
      // Opening on pointerup keeps the browser's mousedown focus from closing the editor.
      if (pendingEdit) editor.edit(pendingEdit, true);
      pendingEdit = "";
    },
    options
  );
}

/** Target picking consumes the gesture before normal selection or dragging can change its source. */
function bindRelateInput(editor: EditorController, options: { signal: AbortSignal }) {
  window.addEventListener(
    "pointerdown",
    (event) => {
      const area = editor.element.parentElement ?? editor.element;
      if (
        !editor.ui.relating ||
        event.button !== 2 ||
        !(event.target instanceof Node) ||
        !area.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showRelate(editor, false);
    },
    { ...options, capture: true }
  );
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      const source = editor.ui.relating;
      if (!source || event.button === 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button === 2) {
        showRelate(editor, false);
        return;
      }
      const cell = cellAt(editor, event);
      const target = cell?.id ? editor.document.get(cell.id) : undefined;
      if (!target || target.id === source || !canConnect(target)) return;
      relateTo(editor, target.id, source);
      showRelate(editor, false);
    },
    { ...options, capture: true }
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (!editor.ui.relating || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showRelate(editor, false);
    },
    { ...options, capture: true }
  );
}

export function bindCanvasInput(editor: EditorController) {
  const abort = new AbortController();
  const panHold = new TemporaryPan(editor);
  bindInteractionCursors(editor, abort.signal);
  const options = { signal: abort.signal };
  bindMarkdownLinks(editor, abort.signal);
  bindRelateInput(editor, options);
  bindDrawingInput(editor, abort.signal);
  editor.measurement.bind(abort.signal);
  bindGridGesture(editor, abort.signal);
  bindPointerTools(editor, options);
  bindPeek(editor, options);
  window.addEventListener(
    "click",
    (event) => {
      // A pointer click on a canvas control returns focus so shortcuts keep working.
      if (event.detail === 0 || editor.editId) return;
      const target = event.target;
      // A click that opened a field to type in, such as the relate picker, keeps its focus there.
      const typing = document.activeElement?.matches("input, textarea, select");
      if (
        target instanceof Element &&
        !typing &&
        !editor.ui.menu &&
        target.closest("button") &&
        target.closest(".canvas-area, .left-rail, .inspector") &&
        !target.closest(".selection-popover, .menu-anchor")
      )
        editor.element.focus({ preventScroll: true });
    },
    options
  );
  // A click on a label's folded count expands the item; one on its comment count opens them.
  editor.element.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const mark = event.target.closest("[data-mark]")?.getAttribute("data-mark");
      if (!mark) return;
      const cell = cellAt(editor, event);
      if (!cell?.id) return;
      if (mark === "collapsed") changeFields(editor.document, [cell.id], { collapsed: false });
      if (mark === "comments") showComments(editor, cell.id);
    },
    { ...options, capture: true }
  );
  // Capture: maxGraph consumes double-clicks on shape nodes before they can bubble here.
  editor.element.addEventListener(
    "dblclick",
    (event) => {
      const cell = cellAt(editor, event);
      if (cell) editor.edit(cell.id!);
    },
    { ...options, capture: true }
  );
  editor.element.addEventListener("wheel", wheelHandler(editor, abort.signal), {
    ...options,
    passive: false,
  });
  bindPointerPosition(editor, abort.signal);
  window.addEventListener("keydown", (event) => keyboard(editor, event, panHold), options);
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "Space") panHold.release();
    },
    options
  );
  window.addEventListener("blur", panHold.release, options);
  // The right button opens the menu and the middle button pans; maxGraph handles the left alone.
  const pan = editor.graph.getPlugin<PanningHandler>("PanningHandler");
  if (pan) pan.usePopupTrigger = false;
  configureButtons(editor.band);
  bindPointerButtons(editor, abort.signal);
  configureCreateTarget(editor.graph, editor.document);
  keepSelectionOnReclick(editor.graph);
  configureCentredResize();
  return () => abort.abort();
}

function bindGridGesture(editor: EditorController, signal: AbortSignal) {
  editor.element.addEventListener("pointerdown", () => editor.grid.freeze(), {
    signal,
    capture: true,
  });
  window.addEventListener("pointerup", editor.grid.release, { signal });
  window.addEventListener("pointercancel", editor.grid.release, { signal });
}

function bindPointerPosition(editor: EditorController, signal: AbortSignal) {
  editor.element.addEventListener(
    "pointermove",
    ({ clientX, clientY }) => (editor.pointer = { clientX, clientY }),
    { signal }
  );
  editor.element.addEventListener("pointerleave", () => (editor.pointer = null), { signal });
}

function connectClick(editor: EditorController, source: string, target: string) {
  if (!source || !editor.document.get(source)) {
    editor.select(target);
    return target;
  }
  editor.document.create("line", 0, 0, {
    from: source,
    to: target,
    ...creationValues("line", scaleOf(editor.document.get(source)!)),
  });
  editor.setTool("select");
  return "";
}

/** Applies at most one view change per frame; a full view revalidation can outlast a frame. */
function wheelHandler(editor: EditorController, signal: AbortSignal) {
  let panX = 0;
  let panY = 0;
  let zoomDelta = 0;
  let pointer = { clientX: 0, clientY: 0 };
  let scheduled = false;
  const apply = () => {
    scheduled = false;
    if (signal.aborted) return;
    const view = editor.graph.view;
    if (zoomDelta) {
      const point = editor.worldPoint(pointer);
      const scale = clampScale(view.scale * Math.exp(-zoomDelta * 0.002));
      const ratio = view.scale / scale;
      view.scaleAndTranslate(
        scale,
        (point.x + view.translate.x) * ratio - point.x - panX / scale,
        (point.y + view.translate.y) * ratio - point.y - panY / scale
      );
    } else {
      view.setTranslate(view.translate.x - panX / view.scale, view.translate.y - panY / view.scale);
    }
    panX = panY = zoomDelta = 0;
  };
  return (event: WheelEvent) => {
    event.preventDefault();
    const units = [1, 16, viewportSize(editor.element).height];
    const unit = units[event.deltaMode] ?? 1;
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      (Math.abs(event.deltaX) > 0 || !Number.isInteger(event.deltaY))
    ) {
      panX += event.deltaX * unit;
      panY += event.deltaY * unit;
    } else {
      zoomDelta += event.deltaY * unit;
      pointer = event;
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(apply);
    }
  };
}
