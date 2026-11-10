import { useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Ellipsis } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { textCanResize } from "../document/capabilities";
import { effectiveAppearance } from "../document/appearance";
import { fitText } from "../editor/textLayout";
import type { CellState } from "@maxgraph/core";

type Clipped = { id: string; name: string; x: number; y: number };

/** Inspect rendered, visible labels; overflow remains presentation state, never document data. */
export function TextOverflow({ editor }: Readonly<{ editor: EditorController }>) {
  const [clipped, setClipped] = useState<Clipped[]>([]);
  useLayoutEffect(() => observeClipped(editor, setClipped), [editor]);
  if (editor.ui.dragging || editor.ui.menu) return null;
  return clipped.map((item) => (
    <button
      key={item.id}
      ref={(node) => {
        if (node) {
          node.style.left = `${item.x}px`;
          node.style.top = `${item.y}px`;
        }
      }}
      className="text-overflow-indicator"
      aria-label={`Fit clipped text: ${item.name.split("\n")[0] || "Object"}`}
      data-hint="Text clipped · Fit to text"
      data-hint-detail="Grow this object until all of its hidden text shows."
      data-tip={item.name}
      onClick={() => {
        editor.select(item.id);
        void fitText(editor.document, item.id);
      }}
    >
      <Ellipsis size={14} />
    </button>
  ));
}

function observeClipped(editor: EditorController, setClipped: Dispatch<SetStateAction<Clipped[]>>) {
  let frame = 0;
  let active = true;
  const schedule = () => {
    cancelAnimationFrame(frame);
    if (!active) return;
    frame = requestAnimationFrame(() => {
      const next = [...editor.graph.view.states.values()].flatMap((state) =>
        clippedLabel(editor, state)
      );
      setClipped((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    });
  };
  const unbind = editor.subscribe(schedule);
  const unbindView = editor.subscribeView(schedule);
  schedule();
  void document.fonts.ready.then(schedule);
  return () => {
    active = false;
    cancelAnimationFrame(frame);
    unbind();
    unbindView();
  };
}

function clippedLabel(editor: EditorController, state: CellState): Clipped[] {
  const item = editor.document.get(state.cell.id ?? "");
  if (!item || !textCanResize(item) || item.id === editor.editId || !state.text?.node) return [];
  if (!visibleLabel(editor, state)) return [];
  const label = state.text.node.querySelector(".canvas-markdown");
  if (!label) return [];
  const look = effectiveAppearance(item, editor.document.namedStyle(item.style));
  const available = state.height - look.padding * look.scale * editor.graph.view.scale * 2;
  if (label.getBoundingClientRect().height <= available + 2) return [];
  return [
    { id: item.id, name: item.name, x: state.x + state.width - 12, y: state.y + state.height - 12 },
  ];
}

function visibleLabel(editor: EditorController, state: CellState) {
  return (
    state.x + state.width >= 0 &&
    state.y + state.height >= 0 &&
    state.x <= editor.element.clientWidth &&
    state.y <= editor.element.clientHeight
  );
}
