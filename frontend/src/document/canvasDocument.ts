import * as Y from "yjs";
import { LOCAL, type CanvasObject, type ObjectKind, type StyleValue } from "./types";
import { compareStacking, isVertexKind, readWorldObject, type StoredObject } from "./geometry";

export class CanvasDocument {
  private listed: CanvasObject[] | null = null;
  private transacting = false;
  readonly doc = new Y.Doc();
  readonly objects = this.doc.getMap<Y.Map<unknown>>("objects");
  readonly meta = this.doc.getMap<string>("meta");
  /** Saved views. The map keeps its original name so existing rooms keep theirs. */
  readonly views = this.doc.getMap<string>("bookmarks");
  readonly undo = new Y.UndoManager([this.objects, this.meta, this.views], {
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
    this.objects.forEach((record) => {
      const order = record.get("order");
      if (typeof order === "number" && order > highest) highest = order;
    });
    return highest + 1;
  }

  create(kind: ObjectKind, x: number, y: number, extras: Partial<CanvasObject> = {}) {
    this.undo.stopCapturing();
    const id = crypto.randomUUID();
    const item: CanvasObject = {
      id,
      kind,
      label: "",
      x,
      y,
      width: 160,
      height: 90,
      parent: "",
      source: "",
      target: "",
      points: "[]",
      order: this.nextOrder(),
      style: {},
      ...extras,
    };
    if (kind === "icon") Object.assign(item, { width: 64, height: 64, ...extras });
    if (kind === "sticky")
      Object.assign(item, {
        width: 190,
        height: 170,
        ...extras,
        style: { fillColor: "#fff0ad", ...extras.style },
      });
    this.doc.transact(() => this.insert(item), LOCAL);
    this.undo.stopCapturing();
    return id;
  }

  insert(item: CanvasObject) {
    const record = new Y.Map<unknown>();
    this.objects.set(item.id, record);
    const { label, style, ...properties } = item;
    Object.entries(properties).forEach(([key, value]) => record.set(key, value));
    if (isVertexKind(item.kind)) {
      record.set("worldX", item.x);
      record.set("worldY", item.y);
    }
    record.set("worldPoints", item.points);
    const text = new Y.Text();
    record.set("label", text);
    text.insert(0, label);
    const styles = new Y.Map<StyleValue>();
    record.set("style", styles);
    Object.entries(style).forEach(([key, value]) => styles.set(key, value));
  }

  get(id: string): CanvasObject | null {
    return readWorldObject(id, (key) => {
      const record = this.objects.get(key);
      return record ? (record.toJSON() as StoredObject) : null;
    });
  }

  freezeLegacyGeometry() {
    const snapshots = [...this.objects.keys()].map((id) => this.get(id)!);
    snapshots.forEach((item) => {
      const record = this.objects.get(item.id)!;
      if (record.has("legacyWorld")) return;
      if (
        record.has("worldPoints") &&
        (!isVertexKind(item.kind) || (record.has("worldX") && record.has("worldY")))
      )
        return;
      record.set("legacyWorld", { x: item.x, y: item.y, points: item.points });
    });
  }

  /** Visible objects in stacking order. Callers must not mutate the shared result. */
  list() {
    if (this.listed) return this.listed;
    const items = [...this.objects.keys()]
      .map((id) => this.get(id)!)
      .filter(
        (item) =>
          item.kind !== "connector" ||
          (this.objects.has(item.source) && this.objects.has(item.target))
      )
      .sort(compareStacking);
    if (!this.transacting) this.listed = items;
    return items;
  }

  patch(id: string, values: Partial<CanvasObject>) {
    const record = this.objects.get(id);
    if (!record) return;
    const current = this.get(id)!;
    this.doc.transact(() => {
      if ("parent" in values && values.parent !== current.parent) this.freezeLegacyGeometry();
      Object.entries(values).forEach(([key, value]) => {
        if (key === "label") this.editText(id, String(value));
        else if (key === "style") this.patchStyle(id, value as CanvasObject["style"]);
        else if (current[key as keyof CanvasObject] !== value) {
          const field = geometryField(key, current.kind);
          record.set(field, value);
        }
      });
    }, LOCAL);
  }

  clearStyle(id: string, key: string) {
    const styles = this.objects.get(id)?.get("style") as Y.Map<StyleValue> | undefined;
    this.doc.transact(() => styles?.delete(key), LOCAL);
  }

  patchStyle(id: string, values: Record<string, StyleValue>) {
    const styles = this.objects.get(id)?.get("style") as Y.Map<StyleValue> | undefined;
    this.doc.transact(
      () => Object.entries(values).forEach(([key, value]) => styles?.set(key, value)),
      LOCAL
    );
  }

  text(id: string) {
    return this.objects.get(id)?.get("label") as Y.Text | undefined;
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

  remove(ids: string[]) {
    this.undo.stopCapturing();
    const removed = new Set(ids);
    const objects = this.list();
    let previousSize = -1;
    while (previousSize !== removed.size) {
      previousSize = removed.size;
      objects.filter((item) => removed.has(item.parent)).forEach((item) => removed.add(item.id));
    }
    this.doc.transact(() => {
      this.freezeLegacyGeometry();
      this.list().forEach((item) => {
        if (
          removed.has(item.id) ||
          removed.has(item.parent) ||
          removed.has(item.source) ||
          removed.has(item.target)
        )
          this.objects.delete(item.id);
      });
    }, LOCAL);
    this.undo.stopCapturing();
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

function geometryField(key: string, kind: ObjectKind) {
  if (key === "points") return "worldPoints";
  if (isVertexKind(kind) && key === "x") return "worldX";
  if (isVertexKind(kind) && key === "y") return "worldY";
  return key;
}
