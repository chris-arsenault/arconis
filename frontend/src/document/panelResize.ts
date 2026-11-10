import type { Item, Look } from "./types";
import { isFrame } from "./types";
import { selectedItems } from "./relations";
import { transformObjects } from "./transform";
import { authoredLook } from "./appearance";

export interface PanelContentChange {
  id: string;
  geometry: Pick<Item, "x" | "y" | "width" | "height" | "points">;
  look: Look;
}

/** One panel resize transforms the original descendant snapshot once, including nested panels. */
export function resizedPanelContents(
  items: Item[],
  before: Item,
  after: Item,
  lookOf: (item: Item) => Look = authoredLook
): PanelContentChange[] {
  if (
    !isFrame(before) ||
    !after.scaleContents ||
    (before.width === after.width && before.height === after.height) ||
    before.width <= 0 ||
    before.height <= 0
  )
    return [];
  const scaleX = after.width / before.width,
    scaleY = after.height / before.height;
  if (scaleX <= 0 || scaleY <= 0) return [];
  // Area-equivalent scaling composes across incremental pointer or separate width/height edits.
  const paintScale = Math.sqrt(scaleX * scaleY);
  const descendants = selectedItems(items, [before.id]).filter((item) => item.id !== before.id);
  const values = transformObjects(
    descendants,
    {
      anchor: { x: before.x, y: before.y },
      scaleX,
      scaleY,
      angle: 0,
      aspectScale: paintScale,
      offset: { x: after.x - before.x, y: after.y - before.y },
    },
    lookOf
  );
  return descendants.map((item) => {
    const { x, y, width, height, points, paint } = values.get(item.id)!;
    const geometry = { x, y, width, height, points };
    const look: Look = { ...paint, scale: (lookOf(item).scale ?? 1) * paintScale };
    return { id: item.id, geometry, look };
  });
}

/** Native graph edits may report several changed descendants; only their outer resize owns them. */
export function panelResizeChanges(before: Item[], after: Item[], lookOf: (item: Item) => Look) {
  const originals = new Map(before.map((item) => [item.id, item]));
  const resized = after.filter((item) => {
    const old = originals.get(item.id);
    return (
      old &&
      isFrame(old) &&
      item.scaleContents &&
      (old.width !== item.width || old.height !== item.height)
    );
  });
  const descendants = new Set(
    resized.flatMap((item) =>
      selectedItems(before, [item.id])
        .filter((child) => child.id !== item.id)
        .map((child) => child.id)
    )
  );
  return resized
    .filter((item) => !descendants.has(item.id))
    .flatMap((item) => resizedPanelContents(before, originals.get(item.id)!, item, lookOf));
}
