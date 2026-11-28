import { isBox, type Item, type Look } from "./types";
import { compatibleUnit, distanceFactor, isCalibration, type Calibration } from "./units";

type Holder = Pick<Item, "inside" | "type" | "panelCalibration">;

export function panelCalibration(item: Partial<Item>) {
  return (item.type === "frame" || item.type === "group") && isCalibration(item.panelCalibration)
    ? item.panelCalibration
    : null;
}

export function contentScale(
  holder: string,
  root: Calibration | null,
  lookup: (id: string) => Holder | undefined
) {
  const visited = new Set<string>();
  while (holder && !visited.has(holder)) {
    visited.add(holder);
    const item = lookup(holder);
    if (!item) break;
    const calibration = panelCalibration(item);
    if (calibration) return { owner: holder, calibration };
    holder = item.inside;
  }
  return { owner: "", calibration: root };
}

export function magnification(previous: Calibration | null, next: Calibration | null) {
  const unit = previous?.unit ?? "u";
  if (compatibleUnit(next, unit) !== unit) return 1;
  const factor = distanceFactor(previous, unit) / distanceFactor(next, unit);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("Drawing scale is out of range.");
  return factor;
}

function childrenByHolder(items: Map<string, Item>) {
  const children = new Map<string, Item[]>();
  for (const item of items.values()) {
    const siblings = children.get(item.inside);
    if (siblings) siblings.push(item);
    else children.set(item.inside, [item]);
  }
  return children;
}

interface PanelTransform {
  holder: Item;
  scale: number;
  dx: number;
  dy: number;
}

function transformChild(
  item: Item,
  { scale, dx, dy }: PanelTransform,
  lookOf: (item: Item) => Look
): PanelTransform {
  const { x, y } = item;
  if (isBox(item)) {
    item.x = x * scale + dx;
    item.y = y * scale + dy;
    item.width *= scale;
    item.height *= scale;
  }
  item.points = item.points.map(([px, py]) => [px * scale + dx, py * scale + dy]);
  if (scale !== 1) item.look = { ...item.look, scale: (lookOf(item).scale ?? 1) * scale };
  if (item.panelCalibration) {
    // Its border scales in the outer drawing, but its content margins stay in the inner drawing.
    item.panelPaddingScale /= scale;
    return { holder: item, scale: 1, dx: item.x - x, dy: item.y - y };
  }
  return { holder: item, scale, dx, dy };
}

/** Transform owned world geometry in a writer draft. An explicit inner scale starts a new space. */
export function magnifyContents(
  panel: Item,
  items: Map<string, Item>,
  ratio: number,
  lookOf: (item: Item) => Look
) {
  const children = childrenByHolder(items);
  panel.panelPaddingScale *= ratio;
  const pending = [
    { holder: panel, scale: ratio, dx: panel.x * (1 - ratio), dy: panel.y * (1 - ratio) },
  ];
  const seen = new Set<string>();
  while (pending.length) {
    const transform = pending.pop()!;
    const { holder, scale } = transform;
    if (seen.has(holder.id)) continue;
    seen.add(holder.id);
    if (scale !== 1 && holder.arrange.how !== "free")
      holder.arrange = { ...holder.arrange, gap: holder.arrange.gap * scale };
    for (const item of children.get(holder.id) ?? []) {
      pending.push(transformChild(item, transform, lookOf));
    }
  }
  return seen;
}
