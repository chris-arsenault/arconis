import { isBox, isFrame, isLink, type Item, type Look, type PathPoint } from "./types";
import { isLockedIcon } from "./geometry";
import { keepsAspectOnTransform } from "./capabilities";

interface TransformValues {
  anchor: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  /** Clockwise degrees around the anchor. */
  angle: number;
  /** Translation after scaling and rotation, used when a holder's center changes. */
  offset: { x: number; y: number };
  /** Uniform size factor for aspect-preserving content in a general panel resize. */
  aspectScale: number;
}
/** Gesture requests default to no translation and aspect preservation by the smaller axis. */
export type SelectionTransform = Omit<TransformValues, "offset" | "aspectScale"> &
  Partial<Pick<TransformValues, "offset" | "aspectScale">>;
export type TransformedObject = Pick<Item, "x" | "y" | "width" | "height" | "points"> & {
  rotation: number;
  paint: Look;
};
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GROUP_PADDING = 28;
// Small enough for objects created at the deepest zoom.
const MINIMUM_SIZE = 0.001;

/** Applies one transform to world-space objects. Input is the gesture's starting snapshot. */
export function transformObjects(
  items: Item[],
  request: SelectionTransform,
  lookOf: (item: Item) => Look = (item) => item.look
) {
  const transform: TransformValues = {
    offset: { x: 0, y: 0 },
    aspectScale: Math.min(request.scaleX, request.scaleY),
    ...request,
  };
  const apply = pointTransform(transform);
  const result = new Map<string, TransformedObject>();
  for (const item of items) {
    if (!isFrame(item)) result.set(item.id, transformObject(item, transform, apply, lookOf(item)));
  }
  const groups = items.filter((item) => isFrame(item));
  const byId = new Map(items.map((item) => [item.id, item]));
  [...groups]
    .sort((left, right) => depth(right, byId) - depth(left, byId))
    .forEach((group) => {
      result.set(group.id, transformGroup(group, items, result, transform, apply));
    });
  return result;
}

function pointTransform({ anchor, scaleX, scaleY, angle, offset }: TransformValues) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return ([x, y]: PathPoint): PathPoint => {
    const dx = (x - anchor.x) * scaleX;
    const dy = (y - anchor.y) * scaleY;
    return [anchor.x + dx * cos - dy * sin + offset.x, anchor.y + dx * sin + dy * cos + offset.y];
  };
}

function transformObject(
  item: Item,
  { scaleX, scaleY, angle, aspectScale }: TransformValues,
  apply: (point: PathPoint) => PathPoint,
  look: Look
): TransformedObject {
  const rotation = look.rotation ?? 0;
  const points = item.points.map((point) => apply(point).map(round) as PathPoint);
  if (!isBox(item)) return transformPath(item, points, rotation, angle, look);
  const locked = isLockedIcon(item);
  const evenScale = aspectScale;
  const even = keepsAspectOnTransform(item);
  const width = Math.max(MINIMUM_SIZE, round(item.width * (even ? evenScale : scaleX)));
  const height = Math.max(MINIMUM_SIZE, round(item.height * (even ? evenScale : scaleY)));
  const [centerX, centerY] = apply([item.x + item.width / 2, item.y + item.height / 2]);
  return {
    x: round(centerX - width / 2),
    y: round(centerY - height / 2),
    width,
    height,
    points,
    rotation: locked ? 0 : (((rotation + angle) % 360) + 360) % 360,
    paint: {},
  };
}

function transformPath(
  item: Item,
  points: PathPoint[],
  rotation: number,
  angle: number,
  look: Look
): TransformedObject {
  const { x, y, width, height } = item;
  const paint =
    angle && item.type === "drawing" && look.gradient && look.gradient !== "none"
      ? { gradientAngle: ((((look.gradientAngle ?? 0) + angle) % 360) + 360) % 360 }
      : {};
  return { x, y, width, height, points, rotation, paint };
}

function transformGroup(
  group: Item,
  items: Item[],
  result: Map<string, TransformedObject>,
  transform: TransformValues,
  apply: (point: PathPoint) => PathPoint
): TransformedObject {
  const unchanged = { points: group.points, rotation: 0, paint: {} };
  // Rotating a frame's corners would inflate it on every gesture, so it refits its children.
  const children = items.filter((item) => item.inside === group.id && !isLink(item));
  if (transform.angle && children.length) {
    const boxes = children.map((item) => objectBox(item, result.get(item.id)!));
    const box = boxes.reduce(unionBox, boxes[0]);
    return {
      ...unchanged,
      x: round(box.left - GROUP_PADDING),
      y: round(box.top - GROUP_PADDING),
      width: round(box.right - box.left + GROUP_PADDING * 2),
      height: round(box.bottom - box.top + GROUP_PADDING * 2),
    };
  }
  const [x, y] = apply([group.x, group.y]);
  const width = Math.max(MINIMUM_SIZE, round(group.width * transform.scaleX));
  const height = Math.max(MINIMUM_SIZE, round(group.height * transform.scaleY));
  return { ...unchanged, x: round(x), y: round(y), width, height };
}

function objectBox(item: Item, value: TransformedObject): Box {
  if (!isBox(item)) return pointsBox(value.points);
  const radians = (value.rotation * Math.PI) / 180;
  const halfWidth =
    (Math.abs(Math.cos(radians)) * value.width + Math.abs(Math.sin(radians)) * value.height) / 2;
  const halfHeight =
    (Math.abs(Math.sin(radians)) * value.width + Math.abs(Math.cos(radians)) * value.height) / 2;
  const centerX = value.x + value.width / 2;
  const centerY = value.y + value.height / 2;
  return {
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
  };
}

function pointsBox(points: PathPoint[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function unionBox(left: Box, right: Box): Box {
  return {
    left: Math.min(left.left, right.left),
    top: Math.min(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
  };
}

function depth(item: Item, byId: Map<string, Item>) {
  let levels = 0;
  let parent = byId.get(item.inside);
  while (parent && levels < byId.size) {
    levels++;
    parent = byId.get(parent.inside);
  }
  return levels;
}

function round(value: number) {
  return Math.round(value * 100000) / 100000;
}
