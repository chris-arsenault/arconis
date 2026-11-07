import type { EditorController } from "./controller";
import { PanningHandler } from "@maxgraph/core";
import type { ObjectKind } from "../document/types";
import { simplifyPath } from "../document/geometry";
import { clampScale, creationValues, roundForScale } from "./zoom";
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
  if (isTyping(event.target) || activatesControl(event.target, key)) return;
  const actions: Record<string, () => void> = {
    delete: () => editor.remove(),
    backspace: () => editor.remove(),
    escape: () => {
      editor.editId = null;
      editor.graph.clearSelection();
      editor.setTool("select");
    },
    v: () => editor.setTool("select"),
    h: () => editor.setTool("pan"),
    n: () => editor.setTool("sticky"),
    r: () => editor.setTool("rectangle"),
    d: () => editor.setTool("diamond"),
    p: () => editor.setTool("stroke"),
    "]": () => editor.stack("front"),
    "[": () => editor.stack("back"),
    f2: () => editSelection(editor),
    // In a tree, Enter grows a sibling, because that is the next thing typed in an outline.
    enter: () => {
      if (!addBranch(editor, true)) editSelection(editor);
    },
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

function cellAt(editor: EditorController, event: MouseEvent) {
  const bounds = editor.element.getBoundingClientRect();
  return editor.graph.getCellAt(event.clientX - bounds.left, event.clientY - bounds.top);
}

function bindPointerTools(editor: EditorController, options: { signal: AbortSignal }) {
  let points: [number, number][] = [];
  let pendingEdit = "";
  const addSample = (event: { clientX: number; clientY: number }) => {
    const { x, y } = editor.worldPoint(event);
    const [lastX, lastY] = points[points.length - 1];
    if (x !== lastX || y !== lastY) points.push([x, y]);
  };
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      editor.element.focus({ preventScroll: true });
      if (event.button !== 0 || ["select", "pan"].includes(editor.tool)) return;
      event.preventDefault();
      event.stopPropagation();
      if (editor.tool === "stroke") {
        const { x, y } = editor.worldPoint(event);
        points = [[x, y]];
        editor.element.setPointerCapture(event.pointerId);
      } else if (editor.tool === "connector") {
        const cell = cellAt(editor, event);
        if (cell?.isVertex())
          editor.connectionSource = connectClick(editor, editor.connectionSource, cell.id!);
      } else {
        const kind = editor.tool as ObjectKind;
        const point = editor.graph.getPointForEvent(event);
        const id = editor.add(kind, point.x, point.y);
        if (kind === "sticky" || kind === "text") pendingEdit = id;
      }
    },
    { ...options, capture: true }
  );
  editor.element.addEventListener(
    "pointermove",
    (event) => {
      if (!points.length) return;
      const samples = event.getCoalescedEvents();
      (samples.length ? samples : [event]).forEach(addSample);
      drawPreview(editor, points);
    },
    options
  );
  window.addEventListener(
    "pointerup",
    () => {
      if (points.length > 1) {
        const { scale } = editor.graph.view;
        const path = simplifyPath(points, 0.5 / scale).map(([x, y]) => [
          roundForScale(x, scale),
          roundForScale(y, scale),
        ]);
        editor.document.create("stroke", 0, 0, {
          points: JSON.stringify(path),
          ...creationValues("stroke", scale),
        });
      }
      points = [];
      editor.element.querySelector(".stroke-preview")?.remove();
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
  editor.document.create("connector", 0, 0, {
    source,
    target,
    ...creationValues("connector", editor.graph.view.scale),
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

function drawPreview(editor: EditorController, points: [number, number][]) {
  const ns = "http://www.w3.org/2000/svg";
  let svg = editor.element.querySelector<SVGSVGElement>(".stroke-preview");
  if (!svg) {
    svg = document.createElementNS(ns, "svg");
    svg.classList.add("stroke-preview");
    svg.append(document.createElementNS(ns, "polyline"));
    editor.element.append(svg);
  }
  const view = editor.graph.view;
  svg.firstElementChild!.setAttribute(
    "points",
    points
      .map(
        ([x, y]) => `${(x + view.translate.x) * view.scale},${(y + view.translate.y) * view.scale}`
      )
      .join(" ")
  );
}
