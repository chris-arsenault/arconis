import * as Y from "yjs";
import { LOCAL, isLink, type Item, type ItemType, type Look, type View } from "./types";
import { compareStacking } from "./geometry";
import { newId } from "./ids";

/** Fields every item has, with the values an item starts from. */
const BLANK: Omit<Item, "id" | "type"> = {
  name: "",
  subtitle: "",
  inside: "",
  x: 0,
  y: 0,
  width: 160,
  height: 90,
  order: 0,
  style: "",
  look: {},
  stencil: "rectangle",
  icon: "",
  from: "",
  to: "",
  points: [],
  onLine: "",
};

/** The size a new item of a type takes when none is given. */
export function defaultSize(type: ItemType, stencil = "rectangle"): [number, number] {
  if (type === "note") return [190, 170];
  if (type === "frame") return [320, 220];
  if (type === "slide") return [1280, 720];
  if (type === "card") return [260, 72];
  if (type === "node" && stencil === "icon") return [64, 64];
  if (type === "node" && stencil === "junction") return [10, 10];
  return [160, 90];
}

export class CanvasDocument {
  private listed: Item[] | null = null;
  private transacting = false;
  readonly doc = new Y.Doc();
  readonly items = this.doc.getMap<Y.Map<unknown>>("items");
  readonly meta = this.doc.getMap<string>("meta");
  /** Named looks that items refer to by name. */
  readonly styles = this.doc.getMap<Look>("styles");
  readonly views = this.doc.getMap<View>("views");
  /** A conversation, not an edit, so comments stay out of undo. */
  readonly comments = this.doc.getMap<string>("comments");
  readonly undo = new Y.UndoManager([this.items, this.meta, this.styles, this.views], {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 400,
  });

  constructor() {
    this.doc.on("beforeTransaction", () => {
      this.transacting = true;
      this.listed = null;
    });
    this.doc.on("afterTransaction", () => {
      this.transacting = false;
      this.listed = null;
    });
  }

  nextOrder() {
    let highest = -1;
    this.items.forEach((record) => {
      const order = record.get("order");
      if (typeof order === "number" && order > highest) highest = order;
    });
    return highest + 1;
  }

  /** An id no item in this canvas has. */
  freshId() {
    return newId((id) => this.items.has(id));
  }

  create(type: ItemType, x: number, y: number, extras: Partial<Item> = {}) {
    this.undo.stopCapturing();
    const item = this.build(type, x, y, extras);
    this.doc.transact(() => this.insert(item), LOCAL);
    this.undo.stopCapturing();
    return item.id;
  }

  /** A complete new item, not yet in the document, for inserting several in one undo step. */
  build(type: ItemType, x: number, y: number, extras: Partial<Item> = {}): Item {
    const [width, height] = defaultSize(type, extras.stencil);
    return {
      ...BLANK,
      id: this.freshId(),
      type,
      x,
      y,
      width,
      height,
      order: this.nextOrder(),
      ...extras,
    };
  }

  insert(item: Item) {
    const record = new Y.Map<unknown>();
    this.items.set(item.id, record);
    const { name, look, ...fields } = item;
    Object.entries(fields as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined) record.set(key, value);
    });
    const text = new Y.Text();
    record.set("name", text);
    text.insert(0, name);
    const looks = new Y.Map<unknown>();
    record.set("look", looks);
    Object.entries(look).forEach(([key, value]) => {
      if (value !== undefined) looks.set(key, value);
    });
  }

  get(id: string): Item | null {
    const record = this.items.get(id);
    if (!record) return null;
    const stored = record.toJSON() as Partial<Item>;
    // Peers write records, so one without a known shape is left out rather than trusted.
    if (typeof stored.type !== "string") return null;
    return { ...BLANK, ...stored, id } as Item;
  }

  /** Visible items in stacking order. Callers must not mutate the shared result. */
  list() {
    if (this.listed) return this.listed;
    const items = [...this.items.keys()]
      .map((id) => this.get(id))
      .filter((item): item is Item => item !== null)
      .filter((item) => !isLink(item) || (this.items.has(item.from) && this.items.has(item.to)))
      .sort(compareStacking);
    if (!this.transacting) this.listed = items;
    return items;
  }

  /** Changes fields of an item. An undefined value clears an optional field. */
  patch(id: string, values: Partial<Item>) {
    const record = this.items.get(id);
    if (!record) return;
    const current = this.get(id)!;
    this.doc.transact(() => {
      Object.entries(values as Record<string, unknown>).forEach(([key, value]) => {
        if (key === "id") return;
        if (key === "name") this.editText(id, String(value));
        else if (key === "look") this.patchLook(id, value as Look);
        else if (value === undefined) record.delete(key);
        else if (JSON.stringify(current[key as keyof Item]) !== JSON.stringify(value))
          record.set(key, value);
      });
    }, LOCAL);
  }

  /** Sets look properties; an undefined value returns that property to its default. */
  patchLook(id: string, values: Look) {
    const looks = this.items.get(id)?.get("look") as Y.Map<unknown> | undefined;
    if (!looks) return;
    this.doc.transact(
      () =>
        Object.entries(values).forEach(([key, value]) => {
          if (value === undefined) looks.delete(key);
          else if (looks.get(key) !== value) looks.set(key, value);
        }),
      LOCAL
    );
  }

  text(id: string) {
    return this.items.get(id)?.get("name") as Y.Text | undefined;
  }

  editText(id: string, value: string) {
    const text = this.text(id);
    if (!text) return;
    const current = text.toString();
    let start = 0;
    while (start < current.length && start < value.length && current[start] === value[start])
      start++;
    let end = 0;
    while (
      end < current.length - start &&
      end < value.length - start &&
      current.at(-1 - end) === value.at(-1 - end)
    )
      end++;
    this.doc.transact(() => {
      text.delete(start, current.length - start - end);
      text.insert(start, value.slice(start, value.length - end));
    }, LOCAL);
  }

  /** Removes items with everything they hold, the nodes sitting on them and their links. */
  remove(ids: string[]) {
    this.undo.stopCapturing();
    const removed = new Set(ids);
    const items = this.list();
    let previousSize = -1;
    while (previousSize !== removed.size) {
      previousSize = removed.size;
      items
        .filter(
          (item) =>
            removed.has(item.inside) ||
            removed.has(item.onLine) ||
            (isLink(item) && (removed.has(item.from) || removed.has(item.to)))
        )
        .forEach((item) => removed.add(item.id));
    }
    this.doc.transact(() => removed.forEach((id) => this.items.delete(id)), LOCAL);
    this.undo.stopCapturing();
  }

  /** The look a named style gives, or nothing for an unknown name. */
  namedStyle(name: string): Look {
    return (name && this.styles.get(name)) || {};
  }
  setStyle(name: string, look: Look | null) {
    this.doc.transact(() => {
      if (look) this.styles.set(name, look);
      else this.styles.delete(name);
    }, LOCAL);
  }

  rename(title: string) {
    this.doc.transact(() => this.meta.set("title", title), LOCAL);
  }
  title() {
    return this.meta.get("title") || "Untitled canvas";
  }
  destroy() {
    this.undo.destroy();
    this.doc.destroy();
  }
}
