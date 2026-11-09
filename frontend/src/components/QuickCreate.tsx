import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorController } from "../editor/controller";
import { connectedClone } from "../editor/treeEdits";
import type { Direction } from "../editor/walking";
import { isBox, type Item } from "../document/types";
import { creationValues } from "../editor/zoom";

/** How far a dot must be dragged before the copy goes where the pointer is, in pixels. */
const DRAG_SLOP = 6;
const SIDES: Direction[] = ["up", "right", "down", "left"];

/** Places a connected copy where a dragged dot was released, centred under the pointer. */
function placementAt(editor: EditorController, item: Item, event: PointerEvent) {
  const at = editor.worldPoint(event);
  const sizing = creationValues(item.type, editor.graph.view.scale, item.stencil);
  return {
    ...sizing,
    x: at.x - (sizing.width ?? item.width) / 2,
    y: at.y - (sizing.height ?? item.height) / 2,
    look: { ...item.look, ...sizing.look },
  };
}

/** From a press on a dot to its release: a click grows a copy that way, a drag places it. */
function trackDot(
  editor: EditorController,
  item: Item,
  direction: Direction,
  event: ReactPointerEvent
) {
  event.preventDefault();
  event.stopPropagation();
  const origin = { x: event.clientX, y: event.clientY };
  let moved = false;
  const move = (moveEvent: PointerEvent) => {
    if (Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) > DRAG_SLOP)
      moved = true;
  };
  const finish = (upEvent: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    const id = connectedClone(
      editor.document,
      item.id,
      direction,
      moved ? placementAt(editor, item, upEvent) : undefined
    );
    if (!id) return;
    editor.select(id);
    editor.edit(id, true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
}

/** Leave labels and neighbouring objects available for their own click and drag gestures. */
function protectCanvasTargets(editor: EditorController, item: Item, overlay: HTMLElement) {
  const ancestors = new Set<string>();
  let holder = editor.document.get(item.inside);
  while (holder && !ancestors.has(holder.id)) {
    ancestors.add(holder.id);
    holder = editor.document.get(holder.inside);
  }
  const targets = editor.document.list().flatMap((other) => {
    if (other.id === item.id) return [];
    const cell = editor.graph.getDataModel().getCell(other.id);
    const state = cell ? editor.graph.view.getState(cell) : null;
    if (!state) return [];
    const label = state.text?.boundingBox;
    return [
      ...(label ? [label] : []),
      ...(isBox(other) && !ancestors.has(other.id) ? [state] : []),
    ];
  });
  const origin = editor.element.getBoundingClientRect();
  for (const button of overlay.querySelectorAll<HTMLButtonElement>("button")) {
    const dot = button.getBoundingClientRect();
    const blocked = targets.some(
      (target) =>
        dot.right > origin.left + target.x &&
        dot.left < origin.left + target.x + target.width &&
        dot.bottom > origin.top + target.y &&
        dot.top < origin.top + target.y + target.height
    );
    button.style.visibility = blocked ? "hidden" : "";
  }
}

/** A dot on each side of the one selected object: click for a connected copy that way, drag to place it. */
export function QuickCreate({ editor }: Readonly<{ editor: EditorController }>) {
  const [item] = editor.selected();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || !item) return;
    const { scale, translate } = editor.graph.view;
    Object.assign(ref.current.style, {
      left: `${(item.x + translate.x) * scale}px`,
      top: `${(item.y + translate.y) * scale}px`,
      width: `${item.width * scale}px`,
      height: `${item.height * scale}px`,
    });
    protectCanvasTargets(editor, item, ref.current);
  });
  if (!item || editor.selected().length !== 1 || !isBox(item) || item.locked || item.onLine)
    return null;
  if (editor.ui.dragging || editor.editId || item.type === "slide") return null;
  return (
    <div ref={ref} className="quick-create" data-testid="quick-create">
      {SIDES.map((direction) => (
        <button
          key={direction}
          type="button"
          className={`quick-dot ${direction}`}
          aria-label={`Add a connected copy ${direction}`}
          data-hint="Add a connected copy"
          data-hint-detail="Click to place beside this object; drag to choose its position."
          onPointerDown={(event) => trackDot(editor, item, direction, event)}
        />
      ))}
    </div>
  );
}
