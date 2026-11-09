import type { EditorController } from "./controller";
import type { CellState } from "@maxgraph/core";

/** Source editing stays at the item's box; connector text follows its label anchor. */
export function positionTextEditor(
  editor: EditorController,
  id: string,
  element: HTMLTextAreaElement
) {
  const cell = editor.graph.getDataModel().getCell(id);
  const state = cell ? editor.graph.view.getState(cell) : null;
  if (!state) return;
  const point = editorPoint(editor, state);
  const fill = state.style.fillColor;
  Object.assign(element.style, {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${Math.max(120, state.width)}px`,
    height: `${Math.max(60, state.height)}px`,
    backgroundColor: fill && fill !== "none" ? String(fill) : "#ffffff",
  });
}

function editorPoint(editor: EditorController, state: CellState) {
  if (!state.cell.isEdge()) return state;
  const label = state.text?.node?.querySelector(".canvas-markdown");
  if (!label) return state;
  const labelBox = label.getBoundingClientRect();
  const canvasBox = editor.element.getBoundingClientRect();
  return { x: labelBox.x - canvasBox.x, y: labelBox.y - canvasBox.y };
}
