import type { CanvasDocument } from "../document/canvasDocument";
import { inkBounds, isMarkup } from "../document/ink";
import type { Item } from "../document/types";
import { inkAction } from "./inkCommands";
import { transformObjects } from "../document/transform";
import { selectedItems } from "../document/relations";
import { authoredLook } from "../document/appearance";
import { creationOffset, creationValues } from "./zoom";

export function makeDrawing(
  canvas: CanvasDocument,
  items: Item[],
  position: { x: number; y: number },
  scale = 1
) {
  const paths = items.filter((item) => item.type === "drawing" && isMarkup(item));
  const factor = creationOffset(scale),
    padding = 12 * factor;
  const bounds = paths.length
    ? inkBounds(paths.flatMap((item) => item.points))
    : {
        x: position.x - 200 * factor,
        y: position.y - 150 * factor,
        width: 400 * factor,
        height: 300 * factor,
      };
  return inkAction(canvas, () => {
    const id = canvas.create("sketch", bounds.x - padding, bounds.y - padding, {
      name: "Drawing",
      ...creationValues("sketch", scale),
      width: Math.max(40 * factor, bounds.width + padding * 2),
      height: Math.max(40 * factor, bounds.height + padding * 2),
    });
    paths.forEach((item) => canvas.patch(item.id, { inside: id, markup: false }));
    return id;
  });
}

export function returnToMarkup(canvas: CanvasDocument, sketch: Item) {
  if (sketch.type !== "sketch") return;
  inkAction(canvas, () => {
    canvas
      .list()
      .filter((item) => item.inside === sketch.id)
      .forEach((item) => canvas.patch(item.id, { inside: "", markup: true }));
    canvas.remove([sketch.id]);
  });
}

export function fitDrawing(canvas: CanvasDocument, sketch: Item) {
  const paths = canvas
    .list()
    .filter((item) => item.inside === sketch.id && item.type === "drawing");
  if (!paths.length) return;
  const box = inkBounds(paths.flatMap((item) => item.points));
  const padding = 12 * (authoredLook(sketch, canvas.namedStyle(sketch.style)).scale ?? 1);
  inkAction(canvas, () =>
    canvas.patch(sketch.id, {
      x: box.x - padding,
      y: box.y - padding,
      width: Math.max(padding * 2, box.width + padding * 2),
      height: Math.max(padding * 2, box.height + padding * 2),
      look: { rotation: 0 },
    })
  );
}

/** Numeric Drawing dimensions use the same collective geometry policy as selection handles. */
export function resizeDrawing(
  canvas: CanvasDocument,
  sketch: Item,
  key: "width" | "height",
  value: number
) {
  const items = selectedItems(canvas.list(), [sketch.id]);
  const transformed = transformObjects(
    items,
    {
      anchor: { x: sketch.x, y: sketch.y },
      scaleX: key === "width" ? value / sketch.width : 1,
      scaleY: key === "height" ? value / sketch.height : 1,
      angle: 0,
    },
    (item) => authoredLook(item, canvas.namedStyle(item.style))
  );
  inkAction(canvas, () =>
    transformed.forEach(({ rotation, gradientAngle, ...geometry }, id) =>
      canvas.patch(id, {
        ...geometry,
        look: { rotation, ...(gradientAngle === undefined ? {} : { gradientAngle }) },
      })
    )
  );
}
