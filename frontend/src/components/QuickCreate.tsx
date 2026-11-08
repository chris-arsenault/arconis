import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorController } from "../editor/controller";
import { connectedClone } from "../editor/treeEdits";
import type { Direction } from "../editor/walking";
import { isBox, LOCAL, type Item } from "../document/types";
import { creationValues } from "../editor/zoom";

/** How far a dot must be dragged before the copy goes where the pointer is, in pixels. */
const DRAG_SLOP = 6;
const SIDES: Direction[] = ["up", "right", "down", "left"];

/** Places a connected copy where a dragged dot was released, centred under the pointer. */
function placeAt(editor: EditorController, item: Item, id: string, event: PointerEvent) {
  const at = editor.worldPoint(event);
  editor.document.doc.transact(
    () =>
      editor.document.patch(id, {
        x: at.x - item.width / 2,
        y: at.y - item.height / 2,
        ...creationValues(item.type, editor.graph.view.scale, item.stencil),
      }),
    LOCAL
  );
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
    const id = connectedClone(editor.document, item.id, direction);
    if (!id) return;
    if (moved) placeAt(editor, item, id, upEvent);
    editor.select(id);
    editor.edit(id, true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
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
          title="Click for a connected copy; drag to place it"
          onPointerDown={(event) => trackDot(editor, item, direction, event)}
        />
      ))}
    </div>
  );
}
