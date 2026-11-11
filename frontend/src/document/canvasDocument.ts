import * as Y from "yjs";
import { LOCAL, isLink, type Item, type ItemType, type Look } from "./types";
import { compareStacking } from "./geometry";
import { newId } from "./ids";
import { CompletedActions } from "./actions";
import { removalClosure } from "./relations";
import { canHoldAnything } from "./capabilities";
import { BASE_LAYER, inLayers, layerOf, orderedLayers, type LayerRecord } from "./layers";
import { BLANK } from "./itemDefaults";
import { readArrangement } from "./arrangement";
import { readClock } from "./clock";
import { isCalibration, readCalibration, type Calibration } from "./units";
export { BLANK } from "./itemDefaults";

/** The size a new item of a type takes when none is given. */
export function defaultSize(type: ItemType, stencil = "rectangle"): [number, number] {
  const sizes: Partial<Record<ItemType, [number, number]>> = {
    note: [190, 170],
    frame: [320, 220],
    slide: [1280, 720],
    card: [260, 72],
  };
  if (type === "node" && stencil === "icon") return [64, 64];
  if (type === "node" && stencil === "junction") return [10, 10];
  return sizes[type] ?? [160, 90];
}

export class CanvasDocument {
  readonly actions = new CompletedActions();
  /**
   * Whose edits these are, in their own words. Every write through this document names them as
   * the item's last editor; empty names nobody, as on the relay, where sessions stamp their own.
   */
  author = "";
  /**
   * The layer this participant's new top-level objects go into. Local, like `author`; an agent's
   * writes name their layer instead.
   */
  activeLayer = BASE_LAYER;
  private unstamped = 0;
  private listed: Item[] | null = null;
  private snapshots = new Map<string, Item>();
  private transacting = false;
  readonly doc = new Y.Doc();
  readonly items = this.doc.getMap<Y.Map<unknown>>("items");
  readonly meta = this.doc.getMap<string>("meta");
  /** Named looks that items refer to by name. */
  readonly styles = this.doc.getMap<Look>("styles");
  /** Content layers by id; see `document/layers.ts`. */
  readonly layers = this.doc.getMap<LayerRecord>("layers");
  /** A conversation, not an edit, so comments stay out of undo. */
  readonly comments = this.doc.getMap<string>("comments");
  readonly undo = new Y.UndoManager([this.items, this.meta, this.styles, this.layers], {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 400,
  });

  constructor() {
    this.items.observeDeep((events) => {
      for (const event of events) {
        const id = event.path[0];
        if (typeof id === "string") this.snapshots.delete(id);
        else event.changes.keys.forEach((_change, key) => this.snapshots.delete(key));
      }
    });
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
    const item: Item = {
      ...BLANK,
      id: this.freshId(),
      type,
      x,
      y,
      width,
      height,
      order: this.nextOrder(),
      markup: type === "highlight",
      tags: [],
      properties: {},
      points: [],
      look: {},
      ...extras,
    };
    const active = this.layers.has(this.activeLayer) ? this.activeLayer : "";
    if (active && !("layer" in extras) && !item.inside && inLayers(item)) item.layer = active;
    return item;
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
    (Object.entries(look) as [string, unknown][]).forEach(([key, value]) => {
      if (value !== undefined) looks.set(key, value);
    });
    this.stamp(record);
  }

  /** Names the person whose edits these are from now on. */
  setAuthor(name: string) {
    this.author = name;
  }

  /** Runs writes, such as opening a file, that keep the editors the items already name. */
  withoutStamps<T>(work: () => T): T {
    this.unstamped++;
    try {
      return work();
    } finally {
      this.unstamped--;
    }
  }

  /** Names this document's author as an item's last editor, now. */
  private stamp(record: Y.Map<unknown>) {
    if (!this.author || this.unstamped) return;
    record.set("editedBy", this.author);
    record.set("editedAt", Date.now());
  }

  /** Names someone as an item's last editor; sessions on the relay stamp their agent this way. */
  stampEditor(id: string, author: string, time = Date.now()) {
    const record = this.items.get(id);
    if (!record) return;
    this.doc.transact(() => {
      record.set("editedBy", author);
      record.set("editedAt", time);
    }, LOCAL);
  }

  get(id: string): Item | null {
    const record = this.items.get(id);
    if (!record) return null;
    const stored = record.toJSON() as Partial<Item>;
    // Peers write records, so one without a known shape is left out rather than trusted.
    if (typeof stored.type !== "string") return null;
    // Slides once held what was dropped on them; such contents now sit at the top level.
    if (stored.inside && !canHoldAnything(this.items.get(stored.inside)?.get("type")))
      stored.inside = "";
    return {
      ...BLANK,
      ...stored,
      id,
      markup: stored.markup ?? stored.type === "highlight",
      arrange: readArrangement(stored.arrange),
      clock: readClock(stored.clock),
    } as Item;
  }

  /** Visible items in stacking order. Callers must not mutate the shared result. */
  list() {
    if (this.listed) return this.listed;
    const items = [...this.items.keys()]
      .map((id) => (this.transacting ? this.get(id) : this.snapshot(id)))
      .filter((item): item is Item => item !== null)
      .filter((item) => !isLink(item) || (this.items.has(item.from) && this.items.has(item.to)))
      .sort(compareStacking);
    if (!this.transacting) this.listed = items;
    return items;
  }

  /** Reuse unchanged read-only list entries; reads inside a transaction always see live fields. */
  private snapshot(id: string) {
    const known = this.snapshots.get(id);
    if (known) return known;
    const item = this.get(id);
    if (item) this.snapshots.set(id, item);
    return item;
  }

  /** Every content layer, bottom to top, the base layer included. */
  layerList() {
    return orderedLayers(this.layers.entries());
  }

  /** Applies named edits; omitted keys stay unchanged. Removing a stored key restores its default. */
  patch(id: string, values: Partial<Item>) {
    const record = this.items.get(id);
    if (!record) return;
    const current = this.get(id)!;
    // Contents are in their holder's layer; one leaving its holders stays in the layer it was in.
    if (values.inside !== undefined && values.inside !== current.inside && !("layer" in values)) {
      const layer = values.inside ? "" : layerOf(current, (holder) => this.get(holder));
      values = { ...values, layer: layer && layer !== BASE_LAYER ? layer : "" };
    }
    this.doc.transact(() => {
      let changed = false;
      Object.entries(values as Record<string, unknown>).forEach(([key, value]) => {
        if (key === "id" || key === "editedBy" || key === "editedAt") return;
        if (key === "name") this.editText(id, String(value));
        else if (key === "look") this.patchLook(id, value as Look);
        else if (value === undefined) {
          if (record.has(key)) {
            record.delete(key);
            changed = true;
          }
        } else if (JSON.stringify(current[key as keyof Item]) !== JSON.stringify(value)) {
          record.set(key, value);
          changed = true;
        }
      });
      if (values.editedBy !== undefined && values.editedAt !== undefined) {
        record.set("editedBy", values.editedBy);
        record.set("editedAt", values.editedAt);
      } else if (changed) this.stamp(record);
    }, LOCAL);
  }

  /** Sets look properties; an undefined value returns that property to its default. */
  patchLook(id: string, values: Look) {
    const record = this.items.get(id);
    const looks = record?.get("look") as Y.Map<unknown> | undefined;
    if (!record || !looks) return;
    this.doc.transact(() => {
      let changed = false;
      (Object.entries(values) as [string, unknown][]).forEach(([key, value]) => {
        if (value === undefined) {
          if (looks.has(key)) {
            looks.delete(key);
            changed = true;
          }
        } else if (looks.get(key) !== value) {
          looks.set(key, value);
          changed = true;
        }
      });
      if (changed) this.stamp(record);
    }, LOCAL);
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
    if (current === value) return;
    this.doc.transact(() => {
      text.delete(start, current.length - start - end);
      text.insert(start, value.slice(start, value.length - end));
      this.stamp(this.items.get(id)!);
    }, LOCAL);
  }

  /** Removes items with everything they hold, the nodes sitting on them and their links. */
  remove(ids: string[]) {
    this.undo.stopCapturing();
    const removed = removalClosure(this.list(), ids);
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

  calibration() {
    return readCalibration(this.meta.get("scale"));
  }

  setCalibration(value: Calibration | null) {
    if (value !== null && !isCalibration(value))
      throw new Error("Scale needs a positive world distance, distance and unit.");
    this.doc.transact(() => {
      if (value) this.meta.set("scale", JSON.stringify(value));
      else this.meta.delete("scale");
    }, LOCAL);
  }
  destroy() {
    this.undo.destroy();
    this.doc.destroy();
  }
}
