import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Rectangle } from "@maxgraph/core";
import type { EditorController } from "../editor/controller";
import type { SelectionTransform } from "../document/transform";
import { isFrame, isLink } from "../document/types";

type Corner = "nw" | "ne" | "se" | "sw";
type WorldBox = { x: number; y: number; width: number; height: number };
type TransformFor = (
  point: { x: number; y: number },
  event: PointerEvent
) => SelectionTransform | null;
const CORNERS: Corner[] = ["nw", "ne", "se", "sw"];
const MINIMUM_SCALE = 0.05;

function track(editor: EditorController, event: ReactPointerEvent, transformFor: TransformFor) {
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const snapshot = editor.transformSnapshot();
  editor.beginTransform();
  const move = (moveEvent: PointerEvent) => {
    const transform = transformFor(editor.worldPoint(moveEvent), moveEvent);
    if (transform) editor.applyTransform(snapshot, transform);
  };
  const finish = () => {
    handle.removeEventListener("pointermove", move as EventListener);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    handle.removeEventListener("lostpointercapture", finish);
    editor.endTransform();
  };
  handle.addEventListener("pointermove", move as EventListener);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
}

function scaling(world: WorldBox, corner: Corner): TransformFor {
  const anchor = {
    x: corner.includes("w") ? world.x + world.width : world.x,
    y: corner.includes("n") ? world.y + world.height : world.y,
  };
  const width = (corner.includes("w") ? world.x : world.x + world.width) - anchor.x;
  const height = (corner.includes("n") ? world.y : world.y + world.height) - anchor.y;
  return (point, event) => {
    let scaleX = width ? Math.max(MINIMUM_SCALE, (point.x - anchor.x) / width) : 1;
    let scaleY = height ? Math.max(MINIMUM_SCALE, (point.y - anchor.y) / height) : 1;
    if (event.shiftKey) scaleX = scaleY = Math.max(scaleX, scaleY);
    return { anchor, scaleX, scaleY, angle: 0 };
  };
}

function rotating(world: WorldBox, start: { x: number; y: number }): TransformFor {
  const anchor = { x: world.x + world.width / 2, y: world.y + world.height / 2 };
  const initial = Math.atan2(start.y - anchor.y, start.x - anchor.x);
  return (point, event) => {
    const degrees =
      ((Math.atan2(point.y - anchor.y, point.x - anchor.x) - initial) * 180) / Math.PI;
    const angle = event.shiftKey ? Math.round(degrees / 15) * 15 : degrees;
    return { anchor, scaleX: 1, scaleY: 1, angle };
  };
}

/**
 * Collective transforms. Native maxGraph handles cover one shape; this frame covers several
 * objects and drawings, which have no resize handles of their own because they are paths.
 */
function frameSelection(editor: EditorController) {
  const cells = editor.graph.getSelectionCells().filter((cell) => {
    const item = editor.document.get(cell.id!);
    return item !== null && !isLink(item);
  });
  const first = cells.length ? editor.document.get(cells[0].id!) : null;
  const onlyGroup =
    cells.length === 1 && (isFrame(first ?? undefined) || cells[0].children.length > 0);
  const drawn = first?.type === "drawing";
  return { cells, first, onlyGroup, drawn };
}

function hidesFrame(editor: EditorController) {
  return (
    editor.tool !== "select" &&
    (!editor.drawing.active ||
      editor.drawing.settings.mode !== "lasso" ||
      editor.selected().some((item) => item.type !== "drawing"))
  );
}

export function SelectionFrame({ editor }: Readonly<{ editor: EditorController }>) {
  if (hidesFrame(editor)) return null;
  const { cells, onlyGroup, drawn } = frameSelection(editor);
  if (cells.length < 2 && !onlyGroup && !drawn) return null;
  const box = editor.graph.getBoundingBox(cells);
  return box && <Frame editor={editor} box={box} rotateOnly={onlyGroup} />;
}

function Frame({
  editor,
  box,
  rotateOnly,
}: Readonly<{ editor: EditorController; box: Rectangle; rotateOnly: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    Object.assign(ref.current.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
  });
  const { scale, translate } = editor.graph.view;
  const world = {
    x: box.x / scale - translate.x,
    y: box.y / scale - translate.y,
    width: box.width / scale,
    height: box.height / scale,
  };
  return (
    <div ref={ref} className="selection-frame" data-testid="selection-frame">
      {!rotateOnly &&
        CORNERS.map((corner) => (
          <span
            key={corner}
            className={`frame-handle ${corner}`}
            data-testid={`frame-${corner}`}
            data-hint="Scale selection"
            data-hint-detail="Drag to scale everything selected from the opposite corner; Shift keeps proportions."
            onPointerDown={(event) => track(editor, event, scaling(world, corner))}
          />
        ))}
      <span
        className="frame-rotate"
        data-testid="frame-rotate"
        data-hint="Rotate selection"
        data-hint-detail="Drag to turn everything selected around its center; Shift snaps to 15° steps."
        onPointerDown={(event) => track(editor, event, rotating(world, editor.worldPoint(event)))}
      />
    </div>
  );
}
