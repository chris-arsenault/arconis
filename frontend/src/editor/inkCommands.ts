import type { CanvasDocument } from "../document/canvasDocument";
import { effectiveAppearance } from "../document/appearance";
import { isMarkup } from "../document/ink";
import { cutInk } from "../document/inkErase";
import { pathsTouch } from "../document/inkHit";
import { creationOffset, creationValues } from "./zoom";
import {
  isBox,
  LOCAL,
  type InkKind,
  type Item,
  type Look,
  type PathPoint,
} from "../document/types";

export interface InkSettings {
  mode:
    "pen" | "highlighter" | "highlight" | "eraser" | "lasso" | "fill" | "eyedropper" | "precision";
  shape: InkKind;
  color: string;
  width: number;
  fill: string;
  gradient: string;
  gradientAngle: number;
  opacity: number;
}

/** Application commands own transactions and Undo; controls supply semantic arguments. */
export function inkAction<T>(canvas: CanvasDocument, change: () => T): T {
  canvas.undo.stopCapturing();
  const finish = canvas.actions.begin();
  try {
    return canvas.doc.transact(change, LOCAL);
  } finally {
    canvas.undo.stopCapturing();
    finish();
  }
}

export function addInk(
  canvas: CanvasDocument,
  points: PathPoint[],
  settings: InkSettings,
  markup = true,
  viewScale = 1
) {
  const { shape, color, width } = settings;
  const closed = ["rectangle", "ellipse", "polygon", "cloud"].includes(shape);
  const look: Look = {
    ...creationValues("drawing", creationOffset(viewScale)).look,
    line: color,
    lineWidth: width,
    path: shape === "brace" ? "curved" : "diagonal",
    strokeOpacity: settings.opacity,
    opacity: settings.opacity,
    closed,
    fill: closed ? settings.fill : "none",
    gradient: closed ? settings.gradient : "none",
    gradientAngle: settings.gradientAngle,
    arrow: shape.includes("arrow") ? "arrow" : "none",
    startArrow: shape === "double-arrow" ? "arrow" : "none",
  };
  return inkAction(canvas, () =>
    canvas.create("drawing", 0, 0, { points, ink: shape, markup, look })
  );
}

export function highlightObject(
  canvas: CanvasDocument,
  id: string,
  settings: InkSettings,
  markup = true
) {
  const target = canvas.get(id);
  if (!target || !isBox(target) || isMarkup(target)) return;
  inkAction(canvas, () => {
    const existing = canvas
      .list()
      .filter(
        (item) =>
          item.type === "highlight" &&
          item.target === id &&
          isMarkup(item) === markup &&
          (markup || (item.layer ?? "base") === (canvas.activeLayer || "base"))
      );
    if (existing.length) canvas.remove(existing.map((item) => item.id));
    else
      canvas.create("highlight", 0, 0, {
        target: id,
        markup,
        look: { line: settings.color, lineWidth: settings.width, strokeOpacity: settings.opacity },
      });
  });
}

export function clearInk(canvas: CanvasDocument) {
  inkAction(canvas, () =>
    canvas.remove(
      canvas
        .list()
        .filter(isMarkup)
        .map((item) => item.id)
    )
  );
}

export function recolorInk(canvas: CanvasDocument, items: Item[], color: string) {
  inkAction(canvas, () =>
    items
      .filter((item) => item.type === "drawing")
      .forEach((item) => canvas.patchLook(item.id, { line: color }))
  );
}

export function eraseWholeInk(
  canvas: CanvasDocument,
  items: Item[],
  sweep: PathPoint[],
  radius: number
) {
  const ids = items
    .filter((item) => item.type === "drawing" && pathsTouch(item.points, sweep, radius))
    .map((item) => item.id);
  inkAction(canvas, () => canvas.remove(ids));
}

export function fillInk(canvas: CanvasDocument, item: Item, settings: InkSettings) {
  const appearance = effectiveAppearance(item, canvas.namedStyle(item.style));
  if (item.type !== "drawing" || !appearance.closed) return;
  inkAction(canvas, () =>
    canvas.patchLook(item.id, {
      fill: settings.fill,
      gradient: settings.gradient,
      gradientAngle: settings.gradientAngle,
    })
  );
}

export function closeInk(canvas: CanvasDocument, items: Item[]) {
  inkAction(canvas, () =>
    items
      .filter((item) => item.type === "drawing")
      .forEach((item) =>
        canvas.patchLook(item.id, {
          closed: !effectiveAppearance(item, canvas.namedStyle(item.style)).closed,
        })
      )
  );
}

export function paintInk(canvas: CanvasDocument, items: Item[], settings: InkSettings) {
  inkAction(canvas, () =>
    items
      .filter(
        (item) =>
          item.type === "drawing" && effectiveAppearance(item, canvas.namedStyle(item.style)).closed
      )
      .forEach((item) =>
        canvas.patchLook(item.id, {
          fill: settings.fill,
          gradient: settings.gradient,
          gradientAngle: settings.gradientAngle,
        })
      )
  );
}

export function eraseInk(
  canvas: CanvasDocument,
  items: Item[],
  sweep: PathPoint[],
  radius: number
) {
  if (!sweep.length) return;
  const eraser = sweep.length > 1 ? sweep : [sweep[0], sweep[0]];
  const touched = items.filter((item) => pathsTouch(item.points, eraser, radius));
  inkAction(canvas, () =>
    touched.forEach((item) => {
      const parts = cutInk(item.points, eraser, radius);
      if (!parts.length) return canvas.remove([item.id]);
      const look = erasedLook(item, parts[0], canvas.namedStyle(item.style));
      canvas.patch(item.id, { points: parts[0], ink: "freehand", look });
      parts.slice(1).forEach((points) =>
        canvas.insert(
          canvas.build("drawing", 0, 0, {
            ...item,
            id: canvas.freshId(),
            points,
            ink: "freehand",
            look: erasedLook(item, points, canvas.namedStyle(item.style)),
            order: canvas.nextOrder(),
          })
        )
      );
    })
  );
}

function erasedLook(item: Item, part: PathPoint[], named: Look): Look {
  const appearance = effectiveAppearance(item, named);
  const starts =
    Math.hypot(part[0][0] - item.points[0][0], part[0][1] - item.points[0][1]) < 0.000001;
  const last = part[part.length - 1],
    original = item.points[item.points.length - 1];
  const ends = Math.hypot(last[0] - original[0], last[1] - original[1]) < 0.000001;
  return {
    ...item.look,
    closed: false,
    fill: "none",
    gradient: "none",
    arrow: ends ? appearance.arrow : "none",
    startArrow: starts ? appearance.startArrow : "none",
  };
}

export function gradientGesture(canvas: CanvasDocument, id: string) {
  canvas.undo.stopCapturing();
  const captureTimeout = canvas.undo.captureTimeout;
  canvas.undo.captureTimeout = Number.MAX_SAFE_INTEGER;
  const finish = canvas.actions.begin();
  return {
    move: (angle: number) => canvas.patchLook(id, { gradientAngle: angle }),
    finish: () => {
      canvas.undo.captureTimeout = captureTimeout;
      canvas.undo.stopCapturing();
      finish();
    },
  };
}
