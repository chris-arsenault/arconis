import type { CanvasObject } from "./types";
import { isContainerKind, isVertexKind } from "./geometry";

export interface SelectionTransform {
  anchor: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  /** Clockwise degrees around the anchor. */
  angle: number;
}
export type TransformedObject = Pick<CanvasObject, "x" | "y" | "width" | "height" | "points"> & {
  rotation: number;
};
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GROUP_PADDING = 28;

/** Applies one transform to world-space objects. Input is the gesture's starting snapshot. */
export function transformObjects(items: CanvasObject[], transform: SelectionTransform) {
  const apply = pointTransform(transform);
  const result = new Map<string, TransformedObject>();
  for (const item of items) {
    if (!isContainerKind(item.kind)) result.set(item.id, transformObject(item, transform, apply));
  }
  const groups = items.filter((item) => isContainerKind(item.kind));
  const byId = new Map(items.map((item) => [item.id, item]));
  [...groups]
    .sort((left, right) => depth(right, byId) - depth(left, byId))
    .forEach((group) => {
      result.set(group.id, transformGroup(group, items, result, transform, apply));
    });
  return result;
}

function pointTransform({ anchor, scaleX, scaleY, angle }: SelectionTransform) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return ([x, y]: [number, number]): [number, number] => {
    const dx = (x - anchor.x) * scaleX;
    const dy = (y - anchor.y) * scaleY;
    return [anchor.x + dx * cos - dy * sin, anchor.y + dx * sin + dy * cos];
  };
}

function transformObject(
  item: CanvasObject,
  { scaleX, scaleY, angle }: SelectionTransform,
  apply: (point: [number, number]) => [number, number]
): TransformedObject {
  const rotation = Number(item.style.rotation || 0);
  const points = JSON.stringify(
    (JSON.parse(item.points) as [number, number][]).map((point) => apply(point).map(round))
  );
  if (!isVertexKind(item.kind)) return { ...item, points, rotation };
  const width = Math.max(1, round(item.width * scaleX));
  const height = Math.max(1, round(item.height * scaleY));
  const [centerX, centerY] = apply([item.x + item.width / 2, item.y + item.height / 2]);
  return {
    x: round(centerX - width / 2),
    y: round(centerY - height / 2),
    width,
    height,
    points,
    rotation: (((rotation + angle) % 360) + 360) % 360,
  };
}

function transformGroup(
  group: CanvasObject,
  items: CanvasObject[],
  result: Map<string, TransformedObject>,
  transform: SelectionTransform,
  apply: (point: [number, number]) => [number, number]
): TransformedObject {
  const unchanged = { points: group.points, rotation: 0 };
  // Rotating a frame's corners would inflate it on every gesture, so it refits its children.
  const children = items.filter((item) => item.parent === group.id && item.kind !== "connector");
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
  const width = Math.max(1, round(group.width * transform.scaleX));
  const height = Math.max(1, round(group.height * transform.scaleY));
  return { ...unchanged, x: round(x), y: round(y), width, height };
}

function objectBox(item: CanvasObject, value: TransformedObject): Box {
  if (!isVertexKind(item.kind)) return pointsBox(JSON.parse(value.points) as [number, number][]);
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

function pointsBox(points: [number, number][]): Box {
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

function depth(item: CanvasObject, byId: Map<string, CanvasObject>) {
  let levels = 0;
  let parent = byId.get(item.parent);
  while (parent && levels < byId.size) {
    levels++;
    parent = byId.get(parent.parent);
  }
  return levels;
}

function round(value: number) {
  return Math.round(value * 100000) / 100000;
}
