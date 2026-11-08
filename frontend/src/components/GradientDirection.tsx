import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorController } from "../editor/controller";
import { effectiveAppearance } from "../document/appearance";
import { inkBounds } from "../document/ink";
import { gradientGesture } from "../editor/inkCommands";
import type { Appearance } from "../document/appearance";

const hasGradient = (look: Appearance | null) =>
  !!look?.closed && !!look.gradient && look.gradient !== "none";

/** Graph-facing direction handle, alongside the existing collective selection frame. */
export function GradientDirection({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLButtonElement>(null);
  const selected = editor.selected();
  const item = selected.length === 1 ? selected[0] : null;
  const look = item ? effectiveAppearance(item, editor.document.namedStyle(item.style)) : null;
  const box = inkBounds(item?.points ?? []);
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const angle = ((look?.gradientAngle ?? 0) * Math.PI) / 180;
  useLayoutEffect(() => {
    const { scale, translate } = editor.graph.view;
    if (ref.current)
      Object.assign(ref.current.style, {
        left: `${(cx + (Math.cos(angle) * box.width) / 2 + translate.x) * scale}px`,
        top: `${(cy + (Math.sin(angle) * box.height) / 2 + translate.y) * scale}px`,
      });
  });
  if (!item || item.type !== "drawing" || !hasGradient(look)) return null;
  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const gesture = gradientGesture(editor.document, item.id);
    const move = (pointer: PointerEvent) => {
      const point = editor.worldPoint(pointer);
      const degrees =
        (Math.atan2((point.y - cy) / (box.height || 1), (point.x - cx) / (box.width || 1)) * 180) /
        Math.PI;
      gesture.move(pointer.shiftKey ? Math.round(degrees / 15) * 15 : degrees);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      gesture.finish();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
  };
  return (
    <button
      ref={ref}
      className="gradient-direction"
      aria-label="Gradient direction"
      title="Drag gradient direction"
      onPointerDown={begin}
    >
      ↗
    </button>
  );
}
