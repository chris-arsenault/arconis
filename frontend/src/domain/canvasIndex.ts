import {
  isBoxItem,
  isLinkItem,
  type Box,
  type BoxItem,
  type Canvas,
  type DomainItem,
} from "./model";

/** A refusal or failed action, worded for whoever made the request. */
export class DomainError extends Error {}

const normalized = (name: string) => name.trim().toLowerCase();

/** Lookups over one projection of the canvas. */
export class CanvasIndex {
  readonly byId = new Map<string, DomainItem>();
  private byName = new Map<string, DomainItem[]>();

  constructor(readonly canvas: Canvas) {
    for (const item of canvas.items) {
      this.byId.set(item.id, item);
      const name = normalized(item.name);
      if (!name) continue;
      this.byName.set(name, [...(this.byName.get(name) ?? []), item]);
    }
  }

  /** An item by its id, or by a name only one item has. */
  find(ref: string): DomainItem {
    const item = this.byId.get(ref);
    if (item) return item;
    const named = this.byName.get(normalized(ref)) ?? [];
    if (named.length === 1) return named[0];
    if (named.length > 1)
      throw new DomainError(
        `${named.length} items are named "${ref}"; use one of their ids: ${named.map((i) => i.id).join(", ")}.`
      );
    throw new DomainError(`Nothing on the canvas has the id or name "${ref}".`);
  }

  box(ref: string): BoxItem {
    const item = this.find(ref);
    if (!isBoxItem(item))
      throw new DomainError(`"${label(item)}" is a ${item.type}, which has no box of its own.`);
    return item;
  }

  /** Items held directly by this one. */
  contents(id: string) {
    return this.canvas.items.filter((item) => item.inside === id);
  }

  /** Items held by this one at any depth. */
  allContents(id: string) {
    const found = new Set<string>();
    const walk = (current: string) =>
      this.contents(current).forEach((item) => {
        if (found.has(item.id)) return;
        found.add(item.id);
        walk(item.id);
      });
    walk(id);
    return [...found];
  }

  linksOf(id: string) {
    return this.canvas.items
      .filter(isLinkItem)
      .filter((link) => link.from === id || link.to === id);
  }

  /** Overlapping boxes, leaving out anything that holds or is held by the item. */
  overlaps(item: Box & { id: string }) {
    const related = new Set([item.id, ...this.allContents(item.id), ...this.holders(item.id)]);
    return this.canvas.items
      .filter(isBoxItem)
      .filter((other) => !related.has(other.id) && intersects(item, other));
  }

  /** The items holding this one, nearest first. */
  holders(id: string) {
    const result: string[] = [];
    let current = this.byId.get(id)?.inside;
    while (current && !result.includes(current)) {
      result.push(current);
      current = this.byId.get(current)?.inside;
    }
    return result;
  }

  bounds(items: DomainItem[] = this.canvas.items): Box | null {
    const boxes = items.filter(isBoxItem);
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return {
      x,
      y,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    };
  }
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** How an item is named in messages. */
export function label(item: DomainItem) {
  return item.name ? item.name : `unnamed ${item.type} ${item.id}`;
}
