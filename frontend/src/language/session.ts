import * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { listComments } from "../document/comments";
import { decks } from "../document/slides";
import { MODULE_IDS, moduleEnabled } from "../document/modules";
import { layerSummary, slideSummary, outline } from "./outline";
import { isBox, type Item } from "../document/types";
import { LanguageError } from "./lexer";
import { footprint, intersects, union, type Box } from "../document/layout";
import { describeLayout, layoutReport, overlappingPairs } from "../document/layoutReport";
import { effectiveAppearance } from "../document/appearance";
import { parse } from "./parser";
import {
  chosenItems,
  partStatement,
  discussionStatements,
  itemStatement,
  printCanvas,
  printItems,
  quote,
  styleStatements,
  scaleStatement,
} from "./printer";
import type { Statement } from "./syntax";
import { directTargets } from "./effects";
import { writeStatements } from "./writer";
import { shopReport, connectedParts } from "./woodParts";

/** More than this in one read asks the reader to narrow it. */
export const READ_LIMIT = 400;

interface ReadSelection {
  items: string[];
  inside: string;
  area: Box | null;
}
/** MCP callers may combine or omit filters; selection operates on normalized filters. */
export type ReadRequest = Partial<ReadSelection>;

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
    const { items, meta, styles, comments, layers } = document;
    this.undo = new Y.UndoManager([items, meta, styles, comments, layers, document.wood.records], {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
  }

  /** Orientation: title, who is here, counts, bounds, styles, an outline and discussions. */
  describe(present: string[] = []) {
    return this.call(() => {
      const items = this.document.list();
      const counts = new Map<string, number>();
      items.forEach((item) => counts.set(item.type, (counts.get(item.type) ?? 0) + 1));
      const bounds = union(items.filter(isBox).map((item) => footprint(item)));
      const kinds = [...counts].map(([type, count]) => `${count} ${type}`).join(", ");
      const lines = [
        `title ${quote(this.document.title())}`,
        scaleStatement(this.document.calibration()),
        `// Enabled modules: ${MODULE_IDS.filter((id) => moduleEnabled(this.document, id)).join(", ") || "none"}`,
        `// People here: ${present.length ? present.join(", ") : "nobody"}`,
        kinds ? `// ${items.length} items: ${kinds}` : "// No items yet",
      ];
      if (bounds)
        lines.push(
          `// Bounds: at ${round(bounds.x)},${round(bounds.y)} size ${round(bounds.width)},${round(bounds.height)}`
        );
      lines.push(...styleStatements(this.document), layerSummary(this.document, items));
      if (moduleEnabled(this.document, "woodworking") || this.document.wood.records.size)
        lines.push(
          `// Woodworking: ${this.document.wood.records.size} physical parts. Read a view or part:<id> for the assembly.`
        );
      lines.push("// Outline:", ...outline(items));
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
      return lines.join("\n");
    });
  }

  private panelScales(chosen: Item[]) {
    const scopes = new Map<string, string[]>();
    for (const item of chosen) {
      const { owner } = this.document.contentScale(item.inside);
      if (owner) scopes.set(owner, [...(scopes.get(owner) ?? []), item.id]);
    }
    return [...scopes].map(
      ([id, views]) =>
        `// ${views.join(", ")} use ${id}: ${scaleStatement(this.document.get(id)!.panelCalibration, "panel-scale")}`
    );
  }

  /** Items in full, with what they hold and the lines among them. With no request, everything. */
  read(input: ReadRequest = {}) {
    const request: ReadSelection = { items: [], inside: "", area: null, ...input };
    return this.call(() => {
      if (!request.items.length && !request.inside && !request.area) return this.readAll();
      const chosen = this.select(request);
      if (chosen.length > READ_LIMIT)
        throw new LanguageError(
          `That is ${chosen.length} items; read at most ${READ_LIMIT} at once by naming items, a holder or an area.`
        );
      chosen.forEach((item) => this.seen.set(item.id, itemStatement(item, true)));
      const ids = new Set(chosen.map((item) => item.id));
      const comments = listComments(this.document).filter((comment) => ids.has(comment.on));
      const lines = [
        scaleStatement(this.document.calibration()),
        ...this.panelScales(chosen),
        ...this.readParts(chosen, request.items),
        printItems(chosen, this.document.layerList(), this.document.list()),
        ...discussionStatements(comments),
      ];
      const notes = this.overlapNotes(
        this.document.list(),
        chosen.map((item) => item.id)
      );
      return [...lines, ...notes].filter(Boolean).join("\n");
    });
  }

  /** Overlaps, objects outside their holder and text that may not fit, for the named items or all. */
  checkLayout(input: ReadRequest = {}) {
    const request: ReadSelection = { items: [], inside: "", area: null, ...input };
    return this.call(() => {
      const all = this.document.list();
      const whole = !request.items.length && !request.inside && !request.area;
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
    if (items.length > READ_LIMIT || this.document.wood.records.size > READ_LIMIT)
      throw new LanguageError(
        `The canvas has ${items.length} items and ${this.document.wood.records.size} physical parts; read at most ${READ_LIMIT} at once by naming items, a holder or an area. describe_canvas gives an outline.`
      );
    items.forEach((item) => this.seen.set(item.id, itemStatement(item, true)));
    const notes = this.overlapNotes(
      items,
      items.map((item) => item.id)
    );
    const parts = this.document.wood.parts();
    for (const [id, part] of parts) this.seen.set(`part:${id}`, partStatement(id, part));
    return [printCanvas(this.document).trimEnd(), ...shopReport(parts), ...notes].join("\n");
  }

  private readParts(items: Item[], requested: string[]) {
    const parts = this.document.wood.parts();
    const seeds = items.flatMap((item) => (item.wood ? [item.wood.part] : []));
    const selected = connectedParts(parts, [
      ...seeds,
      ...requested.filter((id) => id.startsWith("part:")).map((id) => id.slice(5)),
    ]);
    if (selected.size > READ_LIMIT)
      throw new LanguageError(
        "Physical assembly exceeds the bounded read. Use export_document for the complete drawing."
      );
    const lines = [...selected].map(([id, part]) => {
      const text = partStatement(id, part);
      this.seen.set(`part:${id}`, text);
      return text;
    });
    const views = this.document
      .list()
      .filter((item) => item.wood && selected.has(item.wood.part))
      .map(
        (item) => "// View " + item.id + " depicts " + item.wood!.part + " " + item.wood!.projection
      );
    return [...lines, ...views, ...shopReport(selected)];
  }

  /** Applies statements as one change: all of them, or none if any is refused or fails. */
  write(text: string) {
    return this.call((now) => {
      const statements = parse(text);
      this.refuseStale(statements, now.items);
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
      const parts = this.document.wood.parts();
      const partLines: string[] = [];
      for (const [id, part] of parts) {
        const key = `part:${id}`,
          text = partStatement(id, part);
        if (now.items.get(key) !== text) {
          this.seen.set(key, text);
          partLines.push(text);
        }
      }
      for (const key of now.items.keys()) {
        if (key.startsWith("part:") && !parts.has(key.slice(5))) {
          this.seen.delete(key);
          partLines.push("// removed " + key);
        }
      }
      return [
        summary,
        ...partLines,
        ...items.map((item) => itemStatement(item, true)),
        ...this.overlapNotes(all, touched),
      ].join("\n");
    });
  }

  /** File preparation is asynchronous; capture feedback around its synchronous canvas commit. */
  importDocument(write: () => string[]) {
    let created: string[] = [];
    const result = this.call(() => {
      created = write();
      return `// Imported ${created.length} items. Use describe_canvas or read to inspect them.`;
    });
    return { created, result };
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
    for (const [id, part] of this.document.wood.parts())
      items.set(`part:${id}`, partStatement(id, part));
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
  private call(work: (now: Snapshot) => string): string {
    const now = this.snapshot();
    const feed = changesBetween(this.baseline, now);
    const others = feed.lines.length
      ? ["// Others changed since your last call:", ...feed.lines]
      : [];
    try {
      return [work(now), ...others].join("\n");
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

  private refuseStale(statements: Statement[], now: Map<string, string>) {
    const stale: string[] = [];
    const targets = directTargets(statements, (id) => this.document.get(id)?.wood?.part);
    for (const id of targets) {
      const text = now.get(id);
      const seen = this.seen.get(id);
      if (seen !== undefined && text !== seen && (text !== undefined || id.startsWith("part:")))
        stale.push(text ?? `// removed ${id}`);
    }
    if (stale.length) throw new StaleError(stale);
  }

  /** Format the shared document overlap policy without repeating its geometry rules. */
  private overlapNotes(all: Item[], ids: string[]) {
    const selected = new Set(ids);
    const pairs = overlappingPairs(
      all,
      all.filter((item) => selected.has(item.id)),
      (item) => effectiveAppearance(item, this.document.namedStyle(item.style))
    );
    return ids.flatMap((id) => {
      const others = pairs
        .filter((pair) => pair.some((item) => item.id === id))
        .map(([a, b]) => (a.id === id ? b.id : a.id));
      return others.length ? [`// ${id} overlaps ${others.join(", ")}`] : [];
    });
  }

  private select(request: ReadSelection): Item[] {
    const all = this.document.list();
    if (request.items?.length) {
      const missing = request.items.filter(
        (id) =>
          !all.some((item) => item.id === id) &&
          !(id.startsWith("part:") && this.document.wood.records.has(id.slice(5)))
      );
      const quoted = missing.map((id) => quote(id)).join(", ");
      if (missing.length)
        throw new LanguageError(
          `No item has the id ${quoted}. Use describe_canvas to discover current item ids, then read again.`
        );
      const requestedParts = new Set(
        request.items.filter((id) => id.startsWith("part:")).map((id) => id.slice(5))
      );
      return chosenItems(all, [
        ...request.items,
        ...all
          .filter((item) => item.wood && requestedParts.has(item.wood.part))
          .map((item) => item.id),
      ]);
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}
