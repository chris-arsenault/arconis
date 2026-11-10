import type { CanvasDocument } from "../document/canvasDocument";
import { writeComment, type CanvasComment } from "../document/comments";
import { isId, newId } from "../document/ids";
import { containedDescendants, removalClosure } from "../document/relations";
import { isBox, type Item, type Look, type View } from "../document/types";
import { LanguageError } from "./lexer";
import { footprint, type Box } from "../document/layout";
import type { Extent } from "./placement";
import { authoredLook } from "../document/appearance";
import type { LayerRecord } from "../document/layers";
import { BLANK } from "../document/itemDefaults";
import { requestedId, type ItemStatement } from "./syntax";

const GEOMETRY = ["x", "y", "width", "height"] as const;

export interface DraftResult {
  created: string[];
  changed: string[];
  removed: string[];
}

/**
 * A working copy of the canvas that statements change freely. Nothing reaches the document until
 * `commit`, which writes only the differences, so a write that fails partway changes nothing.
 */
export class Draft {
  readonly items = new Map<string, Item>();
  readonly styles = new Map<string, Look>();
  readonly changedStyles = new Map<string, Look>();
  readonly created: string[] = [];
  /** Ids created during this write, including ids a file asked for and was given others in place of. */
  readonly createdHere = new Set<string>();
  readonly removed = new Set<string>();
  /** Items moved during this write, whose holders may need to grow. */
  readonly moved = new Set<string>();
  /** File ids that were taken, and the ids their items got instead. */
  readonly aliases = new Map<string, string>();
  /** Arrangements named in this write, which other statements may place things beside. */
  readonly virtual = new Map<string, Box>();
  readonly comments: CanvasComment[] = [];
  readonly views: View[] = [];
  /** Nodes sitting on lines, whose lines are found once every line exists. */
  readonly anchors: { id: string; ref: string; line: number }[] = [];
  readonly highlights: { id: string; ref: string; line: number }[] = [];
  /** Content layers as this write leaves them, and the items it named a layer for. */
  readonly layers = new Map<string, LayerRecord>();
  readonly layered: { id: string; line: number }[] = [];
  title: string | null = null;
  private readonly original = new Map<string, string>();
  private order: number;

  constructor(readonly document: CanvasDocument) {
    for (const item of document.list()) {
      this.items.set(item.id, structuredClone(item));
      this.original.set(item.id, JSON.stringify(item));
    }
    document.styles.forEach((look, name) => this.styles.set(name, look));
    document.layers.forEach((record, id) => this.layers.set(id, { ...record }));
    this.order = document.nextOrder();
  }

  nextOrder() {
    return this.order++;
  }

  /** A declaration starts from complete domain state before its attributes are interpreted. */
  declare(statement: ItemStatement, inside: string): Item {
    const requested = requestedId(statement.identity);
    const item: Item = {
      ...BLANK,
      id: this.idFor(requested || undefined, statement.line),
      type: statement.type,
      inside,
      order: this.nextOrder(),
      name: statement.name.kind === "set" ? statement.name.value : "",
      subtitle: statement.subtitle.kind === "set" ? statement.subtitle.value : "",
      markup: statement.type === "highlight",
    };
    this.add(item, requested);
    return item;
  }

  freshId() {
    return newId((id) => this.items.has(id) || this.removed.has(id) || this.aliases.has(id));
  }

  /** The id for a new item: the one asked for, or a fresh one when a file's id is taken. */
  idFor(requested: string | undefined, line: number) {
    if (requested === undefined) return this.freshId();
    if (!isId(requested))
      throw new LanguageError(
        `"${requested}" cannot be an id: use letters, digits, _ and -.`,
        line
      );
    if (this.createdHere.has(requested) || this.aliases.has(requested))
      throw new LanguageError(`The id "${requested}" is used twice.`, line);
    if (!this.items.has(requested) && !this.removed.has(requested)) return requested;
    const fresh = this.freshId();
    this.aliases.set(requested, fresh);
    return fresh;
  }

  add(item: Item, requested?: string) {
    this.items.set(item.id, item);
    this.created.push(item.id);
    this.createdHere.add(item.id);
    if (requested) this.createdHere.add(requested);
  }

  resolve(ref: string, line: number) {
    const id = this.aliases.get(ref) ?? ref;
    if (this.virtual.has(id) || this.items.has(id)) return id;
    throw new LanguageError(`No item has the id "${ref}".`, line);
  }

  item(ref: string, line: number) {
    const item = this.items.get(this.resolve(ref, line));
    if (!item) throw new LanguageError(`"${ref}" names an arrangement, not an item.`, line);
    return item;
  }

  lookOf(item: Item): Look {
    return authoredLook(item, this.styles.get(item.style));
  }

  extentOf(item: Item): Extent {
    const { x, y, width, height } = item;
    return { box: { x, y, width, height }, space: footprint(item, this.lookOf(item)) };
  }

  /** An item's or arrangement's extent by reference, for placing other items by it. */
  extent(ref: string, line: number): Extent {
    const id = this.resolve(ref, line);
    const virtual = this.virtual.get(id);
    if (virtual) return { box: virtual, space: virtual };
    const item = this.items.get(id)!;
    if (!isBox(item))
      throw new LanguageError(`"${ref}" is a line, which has no box to place by.`, line);
    return this.extentOf(item);
  }

  /** The space taken by an item or arrangement, or null for a line. */
  spaceOf(id: string): Box | null {
    const item = this.items.get(id);
    if (item) return isBox(item) ? footprint(item, this.lookOf(item)) : null;
    return this.virtual.get(id) ?? null;
  }

  /** Moves an item, with everything it holds, so its top-left corner is at x, y. */
  moveTo(item: Item, x: number, y: number) {
    const dx = x - item.x;
    const dy = y - item.y;
    if (!dx && !dy) return;
    const ids = [item.id, ...containedDescendants([...this.items.values()], item.id)];
    for (const id of ids) {
      const moved = this.items.get(id)!;
      this.moved.add(id);
      if (isBox(moved)) {
        moved.x += dx;
        moved.y += dy;
      } else moved.points = moved.points.map(([px, py]) => [px + dx, py + dy]);
    }
  }

  /** Shifts items or arrangements by an offset. */
  shift(ids: string[], dx: number, dy: number) {
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) this.moveTo(item, item.x + dx, item.y + dy);
      const virtual = this.virtual.get(id);
      if (virtual) this.virtual.set(id, { ...virtual, x: virtual.x + dx, y: virtual.y + dy });
    }
  }

  /** Removes an item with what it holds, what sits on it and the lines touching any of them. */
  remove(id: string) {
    if (this.virtual.has(id)) return;
    const gone = removalClosure([...this.items.values()], [id]);
    gone.forEach((goneId) => {
      this.items.delete(goneId);
      this.removed.add(goneId);
    });
  }

  /** The ids of the items holding this one, innermost first. */
  ancestors(item: Item) {
    const chain: string[] = [];
    for (let id = item.inside; id && !chain.includes(id); id = this.items.get(id)?.inside ?? "")
      chain.push(id);
    return chain;
  }

  /** Writes every difference to the document. Call inside one transaction. */
  commit(): DraftResult {
    const { document } = this;
    const changed: string[] = [];
    // Layout arithmetic leaves float noise; positions keep the precision the language prints.
    for (const id of [...this.created, ...this.moved]) {
      const item = this.items.get(id);
      if (item) for (const key of GEOMETRY) item[key] = Math.round(item[key] * 1e6) / 1e6;
    }
    if (this.title !== null) document.rename(this.title);
    this.changedStyles.forEach((look, name) => document.setStyle(name, look));
    commitLayerRecords(this);
    this.removed.forEach((id) => {
      if (this.original.has(id)) document.items.delete(id);
    });
    for (const id of this.created) {
      const item = this.items.get(id);
      if (item) document.insert(item);
    }
    for (const [id, item] of this.items) {
      const before = this.original.get(id);
      if (!before || before === JSON.stringify(item)) continue;
      document.patch(id, differences(JSON.parse(before) as Item, item));
      changed.push(id);
    }
    this.comments.forEach((comment) => writeComment(document, comment));
    this.views.forEach((view) => document.views.set(view.id, view));
    return {
      created: this.created.filter((id) => this.items.has(id)),
      changed,
      removed: [...this.removed].filter((id) => this.original.has(id)),
    };
  }
}

/** Writes the layer records this write added, changed or dropped. */
function commitLayerRecords(draft: Draft) {
  const { layers } = draft.document;
  for (const id of [...layers.keys()]) if (!draft.layers.has(id)) layers.delete(id);
  draft.layers.forEach((record, id) => {
    const before = layers.get(id);
    if (before?.name !== record.name || before.order !== record.order) layers.set(id, record);
  });
}

/** The fields of `after` that differ from `before`, with cleared ones as undefined. */
function differences(before: Item, after: Item): Partial<Item> {
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "id" || key === "look") continue;
    const left = before[key as keyof Item];
    const right = after[key as keyof Item];
    if (JSON.stringify(left) !== JSON.stringify(right)) result[key] = right;
  }
  const look: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before.look), ...Object.keys(after.look)])) {
    const left = before.look[key as keyof Look];
    const right = after.look[key as keyof Look];
    if (left !== right) look[key] = right;
  }
  if (Object.keys(look).length) result.look = look;
  return result;
}
