import { worldBounds } from "../document/relations";
import type { Item } from "../document/types";
import type { EditorController } from "./controller";
import { creationOffset, viewportSize } from "./zoom";

/**
 * How large a new object is. It takes the scale of the object it is placed closest to, or grown
 * from, so neighbours match whatever the zoom; only where nothing is near does the zoom decide.
 */

/** An inherited scale this many times the zoom's own size on screen, or more, gives way to the zoom. */
const LARGEST_ON_SCREEN = 4;
/** An inherited scale this small a part of the zoom's own size on screen, or less, gives way too. */
const SMALLEST_ON_SCREEN = 1 / 16;

interface Point {
  x: number;
  y: number;
}
type Box = NonNullable<ReturnType<typeof worldBounds>>;

/** How many times its defaults an object is. */
export const scaleOf = (item: Item) => item.look?.scale ?? 1;

/** How far a point is from a box; nothing when it lies inside. */
function distance(box: Box, { x, y }: Point) {
  const dx = Math.max(box.x - x, 0, x - box.x - box.width);
  const dy = Math.max(box.y - y, 0, y - box.y - box.height);
  return Math.hypot(dx, dy);
}

/**
 * The scale of the object closest to a point, or null among none. A point inside several takes
 * the smallest of them, which is the innermost holder.
 */
export function closestScale(items: Item[], point: Point): number | null {
  let best: { distance: number; area: number; scale: number } | null = null;
  for (const item of items) {
    const box = worldBounds([item]);
    if (!box) continue;
    const found = { distance: distance(box, point), area: box.width * box.height };
    const closer =
      !best ||
      found.distance < best.distance ||
      (found.distance === best.distance && found.area < best.area);
    if (closer) best = { ...found, scale: scaleOf(item) };
  }
  return best ? best.scale : null;
}

/**
 * The neighbour's scale, unless it would put the new object far out of proportion with the
 * window: then, or with no neighbour, the zoom's own.
 */
export function inheritedFactor(zoom: number, near: number | null) {
  if (near === null) return zoom;
  const onScreen = near / zoom;
  return onScreen >= LARGEST_ON_SCREEN || onScreen <= SMALLEST_ON_SCREEN ? zoom : near;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The part of the canvas in this person's window. */
function windowBox({ graph, element }: EditorController): Box {
  const { scale, translate } = graph.view;
  const size = viewportSize(element);
  return {
    x: -translate.x,
    y: -translate.y,
    width: size.width / scale,
    height: size.height / scale,
  };
}

/** The middle of this person's window, in canvas units. */
export function windowCentre(editor: EditorController): Point {
  const view = windowBox(editor);
  return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
}

/** The objects this person can see in the window; slides and markup set no scale. */
function seen(editor: EditorController) {
  const { graph } = editor;
  const view = windowBox(editor);
  const model = graph.getDataModel();
  const drawn = (item: Item) => {
    const cell = model.getCell(item.id);
    return cell !== null && graph.view.getState(cell) !== null;
  };
  const items = editor.document
    .list()
    .filter((item) => item.type !== "slide" && !item.markup && drawn(item))
    .filter((item) => {
      const box = worldBounds([item]);
      return box !== null && overlaps(box, view);
    });
  return items;
}

/** The factor for an object placed at a world point, or in the middle of the window. */
export function placedFactor(editor: EditorController, point: Point | null = null) {
  const near = closestScale(seen(editor), point ?? windowCentre(editor));
  return inheritedFactor(creationOffset(editor.graph.view.scale), near);
}
