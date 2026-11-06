import type { EditorController } from "./controller";
import { PanningHandler } from "@maxgraph/core";
import type { ObjectKind } from "../document/types";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(target.closest("input, textarea, select, button, a, [role=dialog]")))
  );
}

function keyboard(editor: EditorController, event: KeyboardEvent) {
  if (isTyping(event.target)) return;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
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
    enter: () => {
      const item = editor.selected()[0];
      if (item) editor.edit(item.id);
    },
  };
  if (modifier) return modifiedKey(editor, event);
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

export function bindCanvasInput(editor: EditorController) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let points: [number, number][] = [];
  let connectionSource = "";
  const position = (event: MouseEvent) => editor.graph.getPointForEvent(event);
  const cellAt = (event: MouseEvent) => {
    const bounds = editor.element.getBoundingClientRect();
    return editor.graph.getCellAt(event.clientX - bounds.left, event.clientY - bounds.top);
  };
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      editor.element.focus({ preventScroll: true });
      if (event.button !== 0 || ["select", "pan"].includes(editor.tool)) return;
      event.preventDefault();
      event.stopPropagation();
      const point = position(event);
      if (editor.tool === "stroke") {
        points = [[point.x, point.y]];
        event.stopPropagation();
      } else if (editor.tool === "connector") {
        const cell = cellAt(event);
        if (cell?.isVertex()) connectionSource = connectClick(editor, connectionSource, cell.id!);
      } else editor.add(editor.tool as ObjectKind, point.x, point.y);
    },
    { ...options, capture: true }
  );
  editor.element.addEventListener(
    "pointermove",
    (event) => {
      if (!points.length) return;
      const point = position(event);
      points.push([point.x, point.y]);
      drawPreview(editor, points);
    },
    options
  );
  window.addEventListener(
    "pointerup",
    () => {
      if (points.length > 1)
        editor.document.create("stroke", 0, 0, { points: JSON.stringify(points) });
      points = [];
      editor.element.querySelector(".stroke-preview")?.remove();
    },
    options
  );
  editor.element.addEventListener(
    "dblclick",
    (event) => {
      const cell = cellAt(event);
      if (cell) editor.edit(cell.id!);
    },
    options
  );
  editor.element.addEventListener("wheel", (event) => wheel(editor, event), {
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
  if (!source) {
    editor.select(target);
    return target;
  }
  editor.document.create("connector", 0, 0, { source, target });
  editor.setTool("select");
  return "";
}

function wheel(editor: EditorController, event: WheelEvent) {
  event.preventDefault();
  const view = editor.graph.view;
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    (Math.abs(event.deltaX) > 0 || !Number.isInteger(event.deltaY))
  ) {
    view.setTranslate(
      view.translate.x - event.deltaX / view.scale,
      view.translate.y - event.deltaY / view.scale
    );
  } else {
    const point = editor.graph.getPointForEvent(event);
    const scale = Math.min(64, Math.max(0.02, view.scale * Math.exp(-event.deltaY * 0.002)));
    const ratio = view.scale / scale;
    view.scaleAndTranslate(
      scale,
      (point.x + view.translate.x) * ratio - point.x,
      (point.y + view.translate.y) * ratio - point.y
    );
  }
  editor.emit();
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
