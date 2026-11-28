import { isLink, type Item } from "./types";
import * as Y from "yjs";
import { isWoodKind, resizeFacts, validField, type Parts, type WoodPart } from "./woodworking";

/** One shared field per shop fact so concurrent edits to different dimensions compose. */
export class WoodStore {
  readonly records: Y.Map<Y.Map<string>>;
  private cached: Map<string, WoodPart> | null = null;
  private transacting = false;
  constructor(doc: Y.Doc) {
    doc.on("beforeTransaction", () => {
      this.transacting = true;
    });
    doc.on("afterTransaction", () => {
      this.transacting = false;
    });
    this.records = doc.getMap<Y.Map<string>>("woodworking-parts");
    this.records.observeDeep(() => {
      this.cached = null;
    });
  }
  parts(): Map<string, WoodPart> {
    if (!this.transacting && this.cached) return this.cached;
    const result = new Map<string, WoodPart>();
    this.records.forEach((record, id) => {
      if (!(record instanceof Y.Map)) return;
      const { kind, ...facts } = record.toJSON() as Record<string, string>;
      if (isWoodKind(kind))
        result.set(id, {
          kind,
          facts: Object.fromEntries(
            Object.entries(facts).filter(([k, v]) => typeof v === "string" && validField(kind, k))
          ),
        });
    });
    if (!this.transacting) this.cached = result;
    return result;
  }
  resize(item: Item, values: Partial<Item>, scale: number) {
    if (!item.wood || isLink(item) || (values.width === undefined && values.height === undefined))
      return false;
    const part = this.parts().get(item.wood.part);
    if (!part) return false;
    const changes = resizeFacts(
      part,
      item.wood.projection,
      values.width === item.width ? undefined : values.width,
      values.height === item.height ? undefined : values.height,
      scale
    );
    if (!Object.keys(changes).length) return false;
    this.put(item.wood.part, { ...part, facts: { ...part.facts, ...changes } });
    return true;
  }
  put(id: string, part: WoodPart) {
    const record = this.records.get(id) ?? new Y.Map<string>();
    if (!this.records.has(id)) this.records.set(id, record);
    const fields: Record<string, string> = { ...part.facts, kind: part.kind };
    for (const key of record.keys()) if (!Object.hasOwn(fields, key)) record.delete(key);
    for (const [key, value] of Object.entries(fields))
      if (record.get(key) !== value) record.set(key, value);
  }
  commit(before: Parts, after: Parts) {
    for (const id of before.keys()) if (!after.has(id)) this.records.delete(id);
    for (const [id, part] of after) if (before.get(id) !== part) this.put(id, part);
  }
}
