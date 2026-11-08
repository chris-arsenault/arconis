import type { EditorController, Shape } from "./controller";
import { PanningHandler, type CellState } from "@maxgraph/core";
import { isUnderlay } from "./templates";
import { clampScale, creationValues } from "./zoom";
import { bindDrawingInput } from "./drawingInput";
import { addBranch, zoomIntoSelection, zoomOutOfSelection } from "./topics";

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
function tabKey(editor: EditorController, event: KeyboardEvent) {
  const onCanvas = event.target === document.body || editor.element.contains(event.target as Node);
  if (onCanvas && !event.shiftKey && addBranch(editor)) event.preventDefault();
}

function editSelection(editor: EditorController) {
  const item = editor.selected()[0];
  if (item) editor.edit(item.id);
}

function keyboard(editor: EditorController, event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  // A presentation has its own keys, and nothing is being edited.
  if (editor.presenter.active) return;
  if (isTyping(event.target) || activatesControl(event.target, key)) return;
  const actions: Record<string, () => void> = {
    delete: () => editor.remove(),
    backspace: () => editor.remove(),
    escape: () => editor.clearEditing(),
    v: () => editor.setTool("select"),
    h: () => editor.setTool("pan"),
    n: () => editor.setTool("note"),
    r: () => editor.setTool("rectangle"),
    d: () => editor.setTool("decision"),
    p: () => editor.setTool("draw"),
    "]": () => editor.stack("front"),
    "[": () => editor.stack("back"),
    enter: () => (event.altKey ? addBranch(editor, true) : editSelection(editor)),
    z: () => (event.shiftKey ? zoomOutOfSelection(editor) : zoomIntoSelection(editor)),
  };
  if (modifier) return modifiedKey(editor, event);
  if (key === "tab") {
    tabKey(editor, event);
    return;
  }
  if (key === " ") {
    event.preventDefault();
    editor.setTool("pan");
  } else if (actions[key]) {
    event.preventDefault();
    actions[key]();
  }
}

function modifiedKey(editor: EditorController, event: KeyboardEvent) {
  const actions: Record<string, () => void> = {
    z: () => (event.shiftKey ? editor.document.undo.redo() : editor.document.undo.undo()),
    y: () => editor.document.undo.redo(),
    a: () => editor.graph.selectAll(),
    d: () => editor.duplicate(),
    g: () => (event.shiftKey ? editor.ungroup() : editor.group()),
  };
  const action = actions[event.key.toLowerCase()];
  if (action) {
    event.preventDefault();
    action();
    editor.emit();
  }
}

/** The object under the pointer, looking through templates' underlays to what lies beneath. */
function cellAt(editor: EditorController, event: MouseEvent) {
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

function bindPointerTools(editor: EditorController, options: { signal: AbortSignal }) {
  let pendingEdit = "";
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
      if (
        target instanceof Element &&
        target.closest("button") &&
        target.closest(".canvas-area, .left-rail, .inspector")
      )
        editor.element.focus({ preventScroll: true });
    },
    options
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
  window.addEventListener("keydown", (event) => keyboard(editor, event), options);
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "Space" && editor.tool === "pan") editor.setTool("select");
    },
    options
  );
  const pan = editor.graph.getPlugin<PanningHandler>("PanningHandler");
  if (pan) pan.usePopupTrigger = true;
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
    editor.emit();
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
