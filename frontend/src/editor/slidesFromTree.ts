import type { CanvasDocument } from "../document/canvasDocument";
import { SLIDE_SIZES, nextSlideNumber } from "../document/slides";
import { branchChildren, branchDescendants, worldBounds } from "../document/relations";
import { LOCAL, type Item } from "../document/types";

/** Room kept around a branch inside its slide. */
const SLIDE_PADDING = 60;
const [WIDE] = SLIDE_SIZES;

/** A wide slide's box over a region, at the deck's proportions, no smaller than a wide slide. */
function slideOver(region: { x: number; y: number; width: number; height: number }) {
  const ratio = WIDE.width / WIDE.height;
  const needWidth = Math.max(
    region.width + SLIDE_PADDING * 2,
    (region.height + SLIDE_PADDING * 2) * ratio
  );
  const width = Math.max(WIDE.width, needWidth);
  const height = width / ratio;
  return {
    x: region.x + region.width / 2 - width / 2,
    y: region.y + region.height / 2 - height / 2,
    width,
    height,
  };
}

/**
 * Slides over a tree: a first slide over the whole tree, then one per main branch over that
 * branch's subtree, in the order the branches sit. Slides are viewports, so nothing moves.
 */
export function slidesFromBranches(document: CanvasDocument, rootId: string) {
  const items = document.list();
  const root = items.find((item) => item.id === rootId);
  if (!root) return [];
  const deck = (root.name.split("\n")[0] || "deck").slice(0, 40);
  const subtree = (id: string) => {
    const ids = new Set([id, ...branchDescendants(items, id)]);
    return worldBounds(items.filter((item) => ids.has(item.id)));
  };
  const regions = [
    subtree(rootId),
    ...branchChildren(items, rootId).map((child) => subtree(child.id)),
  ];
  const names = [root.name, ...branchChildren(items, rootId).map((child) => child.name)];
  const orders = items.map((item) => item.order);
  const back = orders.length ? Math.min(...orders) - regions.length : 0;
  const slides: Item[] = [];
  let number = nextSlideNumber(items, deck);
  regions.forEach((region, index) => {
    if (!region) return;
    const box = slideOver(region);
    slides.push(
      document.build("slide", box.x, box.y, {
        name: names[index].split("\n")[0],
        width: box.width,
        height: box.height,
        deck,
        slide: number++,
        order: back + index,
      })
    );
  });
  document.undo.stopCapturing();
  document.doc.transact(() => slides.forEach((slide) => document.insert(slide)), LOCAL);
  document.undo.stopCapturing();
  return slides.map((slide) => slide.id);
}
