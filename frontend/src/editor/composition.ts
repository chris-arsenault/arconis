import { Cell } from "@maxgraph/core";
import { offsetPoints } from "../document/geometry";
import { renameItem } from "../document/relations";
import { newId } from "../document/ids";
import { LOCAL, isBox } from "../document/types";
import type { EditorController } from "./controller";

export function groupSelection(editor: EditorController) {
  if (editor.graph.getSelectionCount() <= 1) return;
  const group = new Cell("Group");
  group.setVertex(true);
  editor.graph.groupCells(group, 28);
  editor.graph.setSelectionCell(group);
}

export function ungroupSelection(editor: EditorController) {
  const { graph, document } = editor;
  const model = graph.getDataModel();
  const labels = new Map(
    Object.values(model.cells || {})
      .filter((cell) => cell.isEdge() && cell.geometry)
      .map((cell) => [cell, cell.geometry!.clone()])
  );
  model.beginUpdate();
  try {
    // Only groups dissolve; a panel keeps its contents.
    const groups = graph
      .getSelectionCells()
      .filter((cell) => document.get(cell.id!)?.type === "group");
    graph.ungroupCells(groups).forEach((cell) => {
      const label = labels.get(cell);
      if (!label || !cell.geometry) return;
      // maxGraph treats relative edge labels as relative child vertices on ungroup.
      const geometry = cell.geometry.clone();
      geometry.x = label.x;
      geometry.y = label.y;
      geometry.relative = true;
      model.setGeometry(cell, geometry);
    });
  } finally {
    model.endUpdate();
  }
}

export function duplicateSelection(editor: EditorController) {
  const { graph, document } = editor;
  const ids = editor.selectionClosure();
  const mapping = new Map<string, string>();
  ids.forEach((id) =>
    mapping.set(
      id,
      newId((candidate) => document.items.has(candidate) || mapping.has(candidate))
    )
  );
  const base = document.nextOrder();
  document.undo.stopCapturing();
  document.doc.transact(
    () =>
      ids.forEach((id, index) => {
        const item = document.get(id)!;
        const offset = 28;
        document.insert({
          ...renameItem(item, mapping),
          order: base + index,
          x: isBox(item) ? item.x + offset : item.x,
          y: isBox(item) ? item.y + offset : item.y,
          points: offsetPoints(item.points, offset, offset),
        });
      }),
    LOCAL
  );
  document.undo.stopCapturing();
  graph.setSelectionCells(
    ids.map((id) => graph.getDataModel().getCell(mapping.get(id)!)).filter((cell) => cell !== null)
  );
}
