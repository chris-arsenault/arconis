import * as Y from "yjs";
import { LOCAL, type CanvasObject, type ObjectKind, type StyleValue } from "./types";

export class CanvasDocument {
  readonly doc = new Y.Doc();
  readonly objects = this.doc.getMap<Y.Map<unknown>>("objects");
  readonly meta = this.doc.getMap<string>("meta");
  readonly bookmarks = this.doc.getMap<string>("bookmarks");
  readonly undo = new Y.UndoManager([this.objects, this.meta, this.bookmarks], {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 400,
  });

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
      style: {},
      ...extras,
    };
    if (kind === "sticky")
      Object.assign(item, { width: 190, height: 170, style: { fillColor: "#fff0ad" }, ...extras });
    this.doc.transact(() => this.insert(item), LOCAL);
    this.undo.stopCapturing();
    return id;
  }

  insert(item: CanvasObject) {
    const record = new Y.Map<unknown>();
    this.objects.set(item.id, record);
    const { label, style, ...properties } = item;
    Object.entries(properties).forEach(([key, value]) => record.set(key, value));
    const text = new Y.Text();
    record.set("label", text);
    text.insert(0, label);
    const styles = new Y.Map<StyleValue>();
    record.set("style", styles);
    Object.entries(style).forEach(([key, value]) => styles.set(key, value));
  }

  get(id: string): CanvasObject | null {
    const record = this.objects.get(id);
    return record ? (record.toJSON() as CanvasObject) : null;
  }

  list() {
    return [...this.objects.keys()]
      .map((id) => this.get(id)!)
      .filter(
        (item) =>
          item.kind !== "connector" ||
          (this.objects.has(item.source) && this.objects.has(item.target))
      );
  }

  patch(id: string, values: Partial<CanvasObject>) {
    const record = this.objects.get(id);
    if (!record) return;
    this.doc.transact(() => {
      Object.entries(values).forEach(([key, value]) => {
        if (key === "label") this.editText(id, String(value));
        else if (key === "style") this.patchStyle(id, value as CanvasObject["style"]);
        else if (record.get(key) !== value) record.set(key, value);
      });
    }, LOCAL);
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
