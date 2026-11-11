import { useEffect, useState, useSyncExternalStore } from "react";
import type { EditorController } from "../editor/controller";
import { isBox } from "../document/types";
import { stackAt } from "../editor/selectBy";
import { gapsBetween } from "../editor/measure";
import { formatDistance } from "../document/units";
import { previewBoxes, type PreviewBox } from "../editor/preview";
import { EqualGaps } from "./EqualGaps";

const noPresence = { subscribe: () => () => {}, snapshot: () => 0 };

/** Whether Alt is held, so measuring and other modifiers can show while it is. */
function useAltHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Alt") setHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt") setHeld(false);
    };
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return held;
}

/** With one object selected and Alt held, the distances to the object under the pointer. */
export function Measure({ editor }: Readonly<{ editor: EditorController }>) {
  const presence = editor.room ?? noPresence;
  useSyncExternalStore(presence.subscribe, presence.snapshot);
  const alt = useAltHeld();
  const [selected] = editor.selected();
  if (!alt || !selected || editor.selected().length !== 1 || !isBox(selected) || !editor.pointer)
    return null;
  const point = editor.worldPoint(editor.pointer);
  const hovered = stackAt(editor.document.list(), point).find((item) => item.id !== selected.id);
  if (!hovered) return null;
  const { scale, translate } = editor.graph.view;
  return (
    <div className="measure" aria-hidden="true" data-testid="measure">
      {gapsBetween(selected, hovered, (distance) =>
        formatDistance(distance * editor.grid.factor, editor.grid.unit, true)
      ).map((gap) => (
        <span
          key={`${gap.x},${gap.y}`}
          className="measure-label"
          ref={(element) => {
            if (!element) return;
            element.style.left = `${(gap.x + translate.x) * scale}px`;
            element.style.top = `${(gap.y + translate.y) * scale}px`;
          }}
        >
          {gap.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Native handle previews are graph-local until release; report their live dimensions in units,
 * and mark the gaps a move is holding equal.
 */
export function ResizeFeedback({ editor }: Readonly<{ editor: EditorController }>) {
  const [box, setBox] = useState<PreviewBox | null>(null);
  useEffect(() => {
    const listener = {
      mouseDown: () => {},
      mouseMove: () => setBox(previewBoxes(editor.graph)[0] ?? null),
      mouseUp: () => setBox(null),
    };
    editor.graph.addMouseListener(listener);
    return () => editor.graph.removeMouseListener(listener);
  }, [editor]);
  const label = (value: number) =>
    formatDistance(value * editor.grid.factor, editor.grid.unit, true);
  return (
    <>
      <EqualGaps editor={editor} />
      {box && (
        <output className="resize-readout" aria-label="Live object size">
          {label(box.width)} × {label(box.height)}
        </output>
      )}
    </>
  );
}
