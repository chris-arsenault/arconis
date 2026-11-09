import * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { listComments } from "../document/comments";
import { decks } from "../document/slides";
import { isBox, isLink, type Item } from "../document/types";
import { LanguageError } from "./lexer";
import { footprint, intersects, union, type Box } from "../document/layout";
import { describeLayout, layoutReport } from "../document/layoutReport";
import { effectiveAppearance } from "../document/appearance";
import { visibleItems } from "../document/relations";
import { parse } from "./parser";
import {
  chosenItems,
  discussionStatements,
  itemStatement,
  printCanvas,
  printItems,
  quote,
  styleStatements,
  viewStatement,
} from "./printer";
import type { Statement } from "./syntax";
import { directTargets } from "./effects";
import { writeStatements } from "./writer";

/** More than this in one read asks the reader to narrow it. */
export const READ_LIMIT = 400;

export interface ReadRequest {
  items?: string[];
  inside?: string;
  area?: Box;
}

interface Snapshot {
  items: Map<string, string>;
  discussions: Map<string, string>;
}

/**
 * One agent's work on a canvas, in the canvas language. It remembers how each item looked when the
 * agent last saw it, refuses edits to items others changed since, and reports others' changes on
 * every call.
 */
export class LanguageSession {
  readonly origin = Symbol("agent session");
  private seen = new Map<string, string>();
  private baseline: Snapshot;
  private readonly undo: Y.UndoManager;

  constructor(
    readonly document: CanvasDocument,
    readonly author: string
  ) {
    this.baseline = this.snapshot();
    const { items, meta, styles, views, comments } = document;
    this.undo = new Y.UndoManager([items, meta, styles, views, comments], {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
  }

  /** Orientation: title, who is here, counts, bounds, styles, an outline, discussions and views. */
  describe(present: string[] = []) {
    return this.call(() => {
      const items = this.document.list();
      const counts = new Map<string, number>();
      items.forEach((item) => counts.set(item.type, (counts.get(item.type) ?? 0) + 1));
      const bounds = union(items.filter(isBox).map((item) => footprint(item)));
      const kinds = [...counts].map(([type, count]) => `${count} ${type}`).join(", ");
      const lines = [
        `title ${quote(this.document.title())}`,
        `// People here: ${present.length ? present.join(", ") : "nobody"}`,
        kinds ? `// ${items.length} items: ${kinds}` : "// No items yet",
      ];
      if (bounds)
        lines.push(
          `// Bounds: at ${round(bounds.x)},${round(bounds.y)} size ${round(bounds.width)},${round(bounds.height)}`
        );
      lines.push(...styleStatements(this.document), "// Outline:", ...outline(items));
      for (const { deck, slides } of decks(items))
        lines.push(`// Deck ${quote(deck)}: ${slides.map(slideSummary).join(", ")}`);
      const open = listComments(this.document).filter(
        (comment) => !comment.thread && !comment.resolved
      );
      if (open.length)
        lines.push(
          "// Open discussions:",
          ...discussionStatements(this.threads(open.map((c) => c.id)))
        );
      lines.push(...[...this.document.views.values()].map(viewStatement));
      return lines.join("\n");
    });
  }

  /** Items in full, with what they hold and the lines among them. With no request, everything. */
  read(request: ReadRequest = {}) {
    return this.call(() => {
      if (!request.items?.length && !request.inside && !request.area) return this.readAll();
      const chosen = this.select(request);
      if (chosen.length > READ_LIMIT)
        throw new LanguageError(
          `That is ${chosen.length} items; read at most ${READ_LIMIT} at once by naming items, a holder or an area.`
        );
      chosen.forEach((item) => this.seen.set(item.id, itemStatement(item, true)));
      const ids = new Set(chosen.map((item) => item.id));
      const comments = listComments(this.document).filter((comment) => ids.has(comment.on));
      const lines = [printItems(chosen), ...discussionStatements(comments)];
      const notes = overlapNotes(
        this.document.list(),
        chosen.map((item) => item.id)
      );
      return [...lines, ...notes].filter(Boolean).join("\n");
    });
  }

  /** Overlaps, objects outside their holder and text that may not fit, for the named items or all. */
  checkLayout(request: ReadRequest = {}) {
    return this.call(() => {
      const all = this.document.list();
      const whole = !request.items?.length && !request.inside && !request.area;
      const chosen = whole ? all : this.select(request);
      const report = layoutReport(all, chosen, (item) =>
        effectiveAppearance(item, this.document.namedStyle(item.style))
      );
      return describeLayout(report, chosen.length).join("\n");
    });
  }

  /** The whole canvas as a file, when it is small enough to read at once. */
  private readAll() {
    const items = this.document.list();
    if (items.length > READ_LIMIT)
      throw new LanguageError(
        `The canvas has ${items.length} items; read at most ${READ_LIMIT} at once by naming items, a holder or an area. describe_canvas gives an outline.`
      );
    items.forEach((item) => this.seen.set(item.id, itemStatement(item, true)));
    const notes = overlapNotes(
      items,
      items.map((item) => item.id)
    );
    return [printCanvas(this.document).trimEnd(), ...notes].join("\n");
  }

  /** Applies statements as one change: all of them, or none if any is refused or fails. */
  write(text: string) {
    return this.call(() => {
      const statements = parse(text);
      this.refuseStale(statements);
      let result!: ReturnType<typeof writeStatements>;
      this.document.doc.transact(() => {
        result = writeStatements(this.document, statements, { author: this.author });
        // Agents name themselves as the editor of what they wrote, as people do in the browser.
        const now = Date.now();
        for (const id of [...result.created, ...result.changed])
          this.document.stampEditor(id, this.author, now);
      }, this.origin);
      this.undo.stopCapturing();
      const touched = [...result.created, ...result.changed];
      const all = this.document.list();
      const items = touched
        .map((id) => all.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      items.forEach((item) => this.seen.set(item.id, itemStatement(item, true)));
      result.removed.forEach((id) => this.seen.delete(id));
      const summary = `// Done: ${result.created.length} created, ${result.changed.length} changed, ${result.removed.length} removed.`;
      return [
        summary,
        ...items.map((item) => itemStatement(item, true)),
        ...overlapNotes(all, touched),
      ].join("\n");
    });
  }

  /** Reverts this session's most recent change, leaving everyone else's alone. */
  undoLast() {
    return this.call(() => {
      if (!this.undo.undoStack.length) throw new LanguageError("This session has nothing to undo.");
      const before = this.snapshot();
      this.undo.undo();
      this.undo.clear(false, true);
      const after = this.snapshot();
      const { ids } = changesBetween(before, after);
      for (const id of ids) {
        const statement = after.items.get(id);
        if (statement === undefined) this.seen.delete(id);
        else this.seen.set(id, statement);
      }
      return [
        "// Undone. These items changed back:",
        ...ids.map((id) => after.items.get(id) ?? `// removed ${id}`),
      ].join("\n");
    });
  }

  destroy() {
    this.undo.destroy();
  }

  private snapshot(): Snapshot {
    const items = new Map(this.document.list().map((item) => [item.id, itemStatement(item, true)]));
    const comments = listComments(this.document);
    const discussions = new Map(
      comments
        .filter((comment) => !comment.thread)
        .map((root) => [root.id, discussionStatements(this.threads([root.id])).join("\n")])
    );
    return { items, discussions };
  }

  private threads(roots: string[]) {
    const wanted = new Set(roots);
    return listComments(this.document).filter(
      (comment) => wanted.has(comment.id) || wanted.has(comment.thread)
    );
  }

  /**
   * Every call reports others' changes since the last one. They count as seen once reported, but
   * not during the call, so an edit to an item someone just changed is still refused.
   */
  private call(work: () => string): string {
    const now = this.snapshot();
    const feed = changesBetween(this.baseline, now);
    const others = feed.lines.length
      ? ["// Others changed since your last call:", ...feed.lines]
      : [];
    try {
      return [work(), ...others].join("\n");
    } catch (error) {
      if (!(error instanceof LanguageError)) throw error;
      const current = error instanceof StaleError ? error.current : [];
      return [`// Nothing was changed. ${error.message}`, ...current, ...others].join("\n");
    } finally {
      this.baseline = this.snapshot();
      for (const id of feed.ids) {
        const statement = this.baseline.items.get(id);
        if (statement === undefined) this.seen.delete(id);
        else this.seen.set(id, statement);
      }
    }
  }

  private refuseStale(statements: Statement[]) {
    const stale: string[] = [];
    for (const id of new Set(directTargets(statements))) {
      const item = this.document.get(id);
      const seen = this.seen.get(id);
      if (item && seen !== undefined && seen !== itemStatement(item, true))
        stale.push(itemStatement(item, true));
    }
    if (stale.length) throw new StaleError(stale);
  }

  private select(request: ReadRequest): Item[] {
    const all = this.document.list();
    if (request.items?.length) {
      const missing = request.items.filter((id) => !all.some((item) => item.id === id));
      const quoted = missing.map((id) => quote(id)).join(", ");
      if (missing.length)
        throw new LanguageError(
          `No item has the id ${quoted}. Use describe_canvas to discover current item ids, then read again.`
        );
      return chosenItems(all, request.items);
    }
    if (request.inside) {
      if (!all.some((item) => item.id === request.inside))
        throw new LanguageError(
          `No item has the id "${request.inside}". Use describe_canvas to discover current holders, then read again.`
        );
      return chosenItems(all, [request.inside]);
    }
    if (request.area) {
      const area = request.area;
      const ids = all
        .filter((item) => isBox(item) && intersects(footprint(item), area))
        .map((item) => item.id);
      return chosenItems(all, ids);
    }
    return all;
  }
}

class StaleError extends LanguageError {
  constructor(readonly current: string[]) {
    super(
      "Since you last saw them, someone else changed the items below. Their current state follows; decide again and resend."
    );
  }
}

function changesBetween(before: Snapshot, after: Snapshot) {
  const lines: string[] = [];
  const ids: string[] = [];
  after.items.forEach((statement, id) => {
    if (before.items.get(id) === statement) return;
    lines.push(statement);
    ids.push(id);
  });
  before.items.forEach((_statement, id) => {
    if (after.items.has(id)) return;
    lines.push(`// removed ${id}`);
    ids.push(id);
  });
  after.discussions.forEach((statement, id) => {
    if (before.discussions.get(id) !== statement) lines.push(statement);
  });
  return { lines, ids };
}

const OUTLINE_ARROWS: Partial<Record<Item["type"], string>> = { branch: "=>", reference: "..>" };

/** A slide in a deck listing: its number, id and name. */
function slideSummary(slide: Item) {
  const parts = [String(slide.slide ?? 0), slide.id];
  if (slide.name) parts.push(quote(slide.name));
  return parts.join(" ");
}

function outline(items: Item[]) {
  const present = new Set(items.map((item) => item.id));
  const lines: string[] = [];
  const children = new Map<string, Item[]>();
  for (const item of items.filter((candidate) => !isLink(candidate))) {
    const holder = present.has(item.inside) ? item.inside : "";
    children.set(holder, [...(children.get(holder) ?? []), item]);
  }
  const visit = (item: Item, depth: number) => {
    const held = children.get(item.id) ?? [];
    const name = item.name ? ` ${quote(item.name)}` : "";
    lines.push(`${"  ".repeat(depth)}${item.type} ${item.id}${name}${held.length ? " {" : ""}`);
    held.forEach((child) => visit(child, depth + 1));
    if (held.length) lines.push(`${"  ".repeat(depth)}}`);
  };
  (children.get("") ?? []).forEach((item) => visit(item, 0));
  for (const item of items.filter(isLink)) {
    const label = item.name ? ` ${quote(item.name)}` : "";
    lines.push(
      `${item.from} ${OUTLINE_ARROWS[item.type] ?? "->"} ${item.to}${label} as ${item.id}`
    );
  }
  return lines;
}

/** Notes on boxes that overlap others they neither hold nor sit in, for the named items. */
function overlapNotes(all: Item[], ids: string[]) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const holds = (outer: Item, inner: Item) => {
    for (let id = inner.inside; id; id = byId.get(id)?.inside ?? "")
      if (id === outer.id) return true;
    return false;
  };
  const boxes = visibleItems(all).filter(
    (item) => isBox(item) && item.type !== "band" && item.type !== "slide" && !item.onLine
  );
  const notes: string[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (!item || !boxes.includes(item)) continue;
    const space = footprint(item);
    const overlapping = boxes.filter(
      (other) =>
        other !== item &&
        !holds(other, item) &&
        !holds(item, other) &&
        intersects(space, footprint(other))
    );
    if (overlapping.length)
      notes.push(`// ${id} overlaps ${overlapping.map((other) => other.id).join(", ")}`);
  }
  return notes;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
