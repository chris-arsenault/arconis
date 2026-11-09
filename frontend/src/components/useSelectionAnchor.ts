import { useLayoutEffect, type RefObject } from "react";
import type { EditorController } from "../editor/controller";

// Rotation and connected-copy handles occupy the first 40 pixels outside an object.
const HANDLE_CLEARANCE = 48;

/** Every object tool uses the same screen-space anchor, including connected and nested items. */
export function useSelectionAnchor(
  editor: EditorController,
  ref: RefObject<HTMLDivElement | null>
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const position = () => {
      const states = editor.selected().flatMap((item) => {
        const cell = editor.graph.getDataModel().getCell(item.id);
        const state = cell && editor.graph.view.getState(cell);
        return state ? [state] : [];
      });
      const bounds = editor.graph.getBoundingBox(states.map((state) => state.cell));
      if (!bounds) return;
      const { x: left, y: top } = bounds;
      const right = left + bounds.width;
      const bottom = top + bounds.height;
      const area = editor.element.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const x = Math.max(8, Math.min((left + right - box.width) / 2, area.width - box.width - 8));
      const chrome = editor.selected().flatMap((item) => {
        const node = editor.element.parentElement?.querySelector<HTMLElement>(
          `.object-metadata[data-object-id="${CSS.escape(item.id)}"]`
        );
        return node ? [node] : [];
      });
      const above =
        Math.min(
          top - HANDLE_CLEARANCE,
          ...chrome.map((node) => node.getBoundingClientRect().top - area.top - 14)
        ) - box.height;
      const below = Math.max(
        bottom + HANDLE_CLEARANCE,
        ...chrome.map((node) => node.getBoundingClientRect().bottom - area.top + 14)
      );
      const titleCovered = coversContainerTitle(editor, {
        left: area.left + x,
        right: area.left + x + box.width,
        top: area.top + above,
        bottom: area.top + above + box.height,
      });
      const y = above >= 8 && !titleCovered ? above : Math.min(below, area.height - box.height - 8);
      Object.assign(element.style, { left: `${x}px`, top: `${Math.max(8, y)}px` });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    observer.observe(editor.element);
    editor.element.parentElement
      ?.querySelectorAll(".object-metadata")
      .forEach((node) => observer.observe(node));
    const stopView = editor.subscribeView(position);
    return () => {
      observer.disconnect();
      stopView();
    };
  });
}

/** A child's tools must leave its container's title available for selection and dragging. */
function coversContainerTitle(
  editor: EditorController,
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">
) {
  const seen = new Set<string>();
  for (const selected of editor.selected()) {
    let id = selected.inside;
    while (id && !seen.has(id)) {
      seen.add(id);
      if (overlapsTitle(editor, id, box)) return true;
      id = editor.document.get(id)?.inside ?? "";
    }
  }
  return false;
}

function overlapsTitle(
  editor: EditorController,
  id: string,
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">
) {
  const cell = editor.graph.getDataModel().getCell(id);
  const state = cell && editor.graph.view.getState(cell);
  const title = state?.text?.node?.getBoundingClientRect();
  if (!title) return false;
  return (
    box.left < title.right &&
    box.right > title.left &&
    box.top < title.bottom &&
    box.bottom > title.top
  );
}
