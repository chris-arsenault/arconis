import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { displayPreferences } from "../editor/displayPreferences";
import type { EditorController } from "../editor/controller";
import { connectedClone } from "../editor/treeEdits";
import type { Direction } from "../editor/walking";
import { isBox, type Item } from "../document/types";
import { creationValues } from "../editor/zoom";
import { scaleOf } from "../editor/creationScale";

/** How far a dot must be dragged before the copy goes where the pointer is, in pixels. */
const DRAG_SLOP = 6;
const SIDES: Direction[] = ["up", "right", "down", "left"];

/** Places a connected copy where a dragged dot was released, centred under the pointer. */
function placementAt(editor: EditorController, item: Item, event: PointerEvent) {
  const at = editor.worldPoint(event);
  const sizing = creationValues(item.type, scaleOf(item), item.stencil);
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

function rectanglesOverlap(a: DOMRect, b: DOMRect) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

/** Move only a handle that actually meets the object's attached indicator strip. */
function avoidMetadata(editor: EditorController, item: Item, overlay: HTMLElement) {
  const metadata = editor.element.parentElement?.querySelector<HTMLElement>(
    `.object-metadata[data-object-id="${CSS.escape(item.id)}"]`
  );
  const strip = metadata?.getBoundingClientRect();
  const area = overlay.getBoundingClientRect();
  for (const side of ["up", "down"] as const) {
    const button = overlay.querySelector<HTMLButtonElement>(`.quick-dot.${side}`);
    if (!button) continue;
    const property = side === "up" ? "top" : "bottom";
    button.style[property] = "";
    if (!strip) continue;
    const dot = button.getBoundingClientRect();
    if (!rectanglesOverlap(dot, strip)) continue;
    button.style[property] =
      `${side === "up" ? strip.top - 4 - dot.height - area.top : area.bottom - strip.bottom - 4 - dot.height}px`;
  }
}

/** A dot on each side of the one selected object: click for a connected copy that way, drag to place it. */
export function QuickCreate({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(displayPreferences.subscribe, displayPreferences.snapshot);
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
    avoidMetadata(editor, item, ref.current);
    protectCanvasTargets(editor, item, ref.current);
  });
  if (!item || editor.selected().length !== 1 || !isBox(item) || item.locked || item.onLine)
    return null;
  if (editor.tool !== "select" || editor.ui.dragging || editor.editId || item.type === "slide")
    return null;
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
