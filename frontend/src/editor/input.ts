import type { EditorController, Shape } from "./controller";
import { PanningHandler, type CellState } from "@maxgraph/core";
import { isUnderlay } from "./templates";
import { clampScale, creationValues } from "./zoom";
import { bindDrawingInput } from "./drawingInput";
import { commandContext, commandForKey, runCommand, showComments } from "./registry";
import { bindPointerButtons, configureButtons } from "./pointerButtons";
import { configureCentredResize, configureCreateTarget } from "./createTarget";
import { nextInStack } from "./selectBy";
import { changeFields } from "./commands";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || Boolean(target.closest("input, textarea, select, [role=dialog]")))
  );
}

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
  if (isTyping(event.target) || activatesControl(event.target, key)) return false;
  const paletteKey = key === "k" && (event.ctrlKey || event.metaKey);
  return !editor.ui.palette || paletteKey;
}

/**
 * Keys run commands from the registry, so a key means the same everywhere it applies. Space is a
 * hold rather than a command, and the palette takes its own keys while it is open.
 */
function keyboard(editor: EditorController, event: KeyboardEvent) {
  if (!takesKey(editor, event)) return;
  if (event.key === " " && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    editor.setTool("pan");
    return;
  }
  const command = commandForKey(event, commandContext(editor));
  if (!command || (event.key === "Tab" && !onCanvas(editor, event))) return;
  event.preventDefault();
  runCommand(editor, command.id);
}

/** The object under the pointer, looking through templates' underlays to what lies beneath. */
export function cellAt(editor: EditorController, event: MouseEvent) {
  if (event.target instanceof Node) {
    for (const [cell, state] of editor.graph.view.states)
      if (!isUnderlay(cell) && state.text?.node?.contains(event.target)) return cell;
  }
  const bounds = editor.element.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
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
      if (editor.tool === "draw") return;
      if (editor.tool === "connect") {
        const cell = cellAt(editor, event);
        if (cell?.isVertex())
          editor.connectionSource = connectClick(editor, editor.connectionSource, cell.id!);
      } else {
        const shape = editor.tool as Shape;
        const point = editor.graph.getPointForEvent(event);
        const id = editor.add(shape, point.x, point.y);
        if (shape === "note" || shape === "text") pendingEdit = id;
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

export function bindCanvasInput(editor: EditorController) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  bindDrawingInput(editor, abort.signal);
  bindPointerTools(editor, options);
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
        target.closest("button") &&
        target.closest(".canvas-area, .left-rail, .inspector") &&
        !target.closest(".selection-popover")
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
      if (mark === "collapsed") changeFields(editor.document, [cell.id], { collapsed: undefined });
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
  editor.element.addEventListener(
    "pointermove",
    ({ clientX, clientY }) => (editor.pointer = { clientX, clientY }),
    options
  );
  editor.element.addEventListener("pointerleave", () => (editor.pointer = null), options);
  window.addEventListener("keydown", (event) => keyboard(editor, event), options);
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "Space" && editor.tool === "pan") editor.setTool("select");
    },
    options
  );
  // The right button opens the menu and the middle button pans; maxGraph handles the left alone.
  const pan = editor.graph.getPlugin<PanningHandler>("PanningHandler");
  if (pan) pan.usePopupTrigger = false;
  configureButtons(editor.band);
  bindPointerButtons(editor, abort.signal);
  configureCreateTarget(editor.graph, editor.document);
  configureCentredResize();
  return () => abort.abort();
}

function connectClick(editor: EditorController, source: string, target: string) {
  if (!source || !editor.document.get(source)) {
    editor.select(target);
    return target;
  }
  editor.document.create("line", 0, 0, {
    from: source,
    to: target,
    ...creationValues("line", editor.graph.view.scale),
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
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      (Math.abs(event.deltaX) > 0 || !Number.isInteger(event.deltaY))
    ) {
      panX += event.deltaX;
      panY += event.deltaY;
    } else {
      zoomDelta += event.deltaY;
      pointer = event;
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(apply);
    }
  };
}
