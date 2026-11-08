import { isBox, isFrame, isLink, type Item, type Look, type PathPoint } from "./types";
import { isLockedIcon } from "./geometry";
import { keepsAspectOnTransform } from "./capabilities";

export interface SelectionTransform {
  anchor: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  /** Clockwise degrees around the anchor. */
  angle: number;
  /** Translation after scaling and rotation, used when a holder's center changes. */
  offset?: { x: number; y: number };
}
export type TransformedObject = Pick<Item, "x" | "y" | "width" | "height" | "points"> & {
  rotation: number;
  gradientAngle?: number;
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
  transform: SelectionTransform,
  lookOf: (item: Item) => Look = (item) => item.look
) {
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

/** Reshaping a Drawing carries its ink from the old bounds into the new bounds. */
export function drawingTransform(
  before: Item,
  after: Item,
  beforeLook: Look,
  afterLook: Look
): SelectionTransform {
  const anchor = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  return {
    anchor,
    scaleX: before.width ? after.width / before.width : 1,
    scaleY: before.height ? after.height / before.height : 1,
    angle: (afterLook.rotation ?? 0) - (beforeLook.rotation ?? 0),
    offset: { x: after.x + after.width / 2 - anchor.x, y: after.y + after.height / 2 - anchor.y },
  };
}

function pointTransform({
  anchor,
  scaleX,
  scaleY,
  angle,
  offset = { x: 0, y: 0 },
}: SelectionTransform) {
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
  { scaleX, scaleY, angle }: SelectionTransform,
  apply: (point: PathPoint) => PathPoint,
  look: Look
): TransformedObject {
  const rotation = look.rotation ?? 0;
  const points = item.points.map((point) => apply(point).map(round) as PathPoint);
  if (!isBox(item)) return transformPath(item, points, rotation, angle, look);
  const locked = isLockedIcon(item);
  const evenScale = Math.min(scaleX, scaleY);
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
  return { x, y, width, height, points, rotation, ...paint };
}

function transformGroup(
  group: Item,
  items: Item[],
  result: Map<string, TransformedObject>,
  transform: SelectionTransform,
  apply: (point: PathPoint) => PathPoint
): TransformedObject {
  const unchanged = { points: group.points, rotation: 0 };
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
