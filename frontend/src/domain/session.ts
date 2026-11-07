import * as Y from "yjs";
import { CanvasDocument } from "../document/canvasDocument";
import { CanvasIndex, DomainError, label } from "./canvasIndex";
import { discussionChanges, itemChanges, type DiscussionChange, type ItemChange } from "./changes";
import { isBoxItem, projectCanvas, type Box, type Canvas, type DomainItem } from "./model";
import { OperationContext, targetsOf, type Operation } from "./context";
import { runOperation } from "./operations";

/** What others changed since this session's previous call. */
export interface Changes {
  items: ItemChange[];
  discussions: DiscussionChange[];
}
export type Outcome<T> =
  | { status: "done"; result: T; changes: Changes }
  | { status: "refused" | "failed"; reason: string; changes: Changes; current?: DomainItem[] };

export interface ReadRequest {
  items?: string[];
  inside?: string;
  area?: Box;
}
/** More than this in one read asks the reader to narrow it. */
export const READ_LIMIT = 400;
/** How many items orientation names before summarizing the rest. */
export const OUTLINE_LIMIT = 500;

interface Snapshot {
  items: Map<string, string>;
  discussions: Map<string, string>;
}

function snapshotOf(canvas: Canvas): Snapshot {
  return {
    items: new Map(canvas.items.map((item) => [item.id, JSON.stringify(item)])),
    discussions: new Map(canvas.discussions.map((d) => [d.id, JSON.stringify(d)])),
  };
}

/**
 * One agent's work on a canvas. It tracks the state of every item the agent has been shown, refuses
 * edits to items others changed since then, and reports others' changes on every call.
 */
export class DomainSession {
  readonly origin = Symbol("agent session");
  private seen = new Map<string, string>();
  private baseline: Snapshot;
  private readonly undo: Y.UndoManager;

  constructor(
    readonly document: CanvasDocument,
    readonly author: string
  ) {
    this.baseline = snapshotOf(projectCanvas(document));
    const { objects, meta, views, comments } = document;
    this.undo = new Y.UndoManager([objects, meta, views, comments], {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
  }

  /** Orientation: the canvas's title, size, contents in outline, open discussions and views. */
  describe(present: string[] = []) {
    return this.call(() => {
      const canvas = projectCanvas(this.document);
      const index = new CanvasIndex(canvas);
      const counts: Record<string, number> = {};
      canvas.items.forEach((item) => (counts[item.type] = (counts[item.type] ?? 0) + 1));
      const outline = canvas.items.slice(0, OUTLINE_LIMIT).map((item) => {
        const entry: Record<string, string> = { id: item.id, type: item.type, name: item.name };
        if (item.inside) entry.inside = item.inside;
        return entry;
      });
      return {
        title: canvas.title,
        present,
        counts,
        bounds: index.bounds(),
        outline,
        omitted: Math.max(0, canvas.items.length - OUTLINE_LIMIT),
        openDiscussions: canvas.discussions.filter((d) => !d.resolved),
        views: canvas.views,
      };
    });
  }

  /** Items with their full state and relationships. With no request, the whole canvas. */
  read(request: ReadRequest = {}) {
    return this.call(() => {
      const canvas = projectCanvas(this.document);
      const index = new CanvasIndex(canvas);
      const chosen = select(index, request);
      if (chosen.length > READ_LIMIT)
        throw new DomainError(
          `That is ${chosen.length} items; read at most ${READ_LIMIT} at once by naming items, a holder or an area.`
        );
      chosen.forEach((item) => this.seen.set(item.id, JSON.stringify(item)));
      const ids = new Set(chosen.map((item) => item.id));
      return {
        items: chosen.map((item) => withRelations(index, item)),
        discussions: canvas.discussions.filter((d) => ids.has(d.on)),
      };
    });
  }

  /** Applies operations as one change: all of them, or none if any is refused or fails. */
  apply(operations: Operation[]) {
    return this.call(() => {
      const context = new OperationContext(this.document, this.author);
      this.refuseStale(context.index, operations);
      this.rehearse(operations);
      const before = snapshotOf(context.index.canvas);
      const depth = this.undo.undoStack.length;
      let done: string[] = [];
      try {
        this.document.doc.transact(() => (done = runAll(context, operations)), this.origin);
      } catch (error) {
        if (this.undo.undoStack.length > depth) this.undo.undo();
        this.undo.clear(false, true);
        throw error;
      }
      this.undo.stopCapturing();
      this.noteOwn(before);
      return { done, created: Object.fromEntries(context.handles) };
    });
  }

  /** Reverts this session's most recent change, leaving everyone else's alone. */
  undoLast() {
    return this.call(() => {
      if (!this.undo.undoStack.length) throw new DomainError("This session has nothing to undo.");
      const before = snapshotOf(projectCanvas(this.document));
      this.undo.undo();
      this.undo.clear(false, true);
      this.noteOwn(before);
      return { undone: true };
    });
  }

  destroy() {
    this.undo.destroy();
  }

  /** Every call reports others' changes since the last one; they count as seen afterwards. */
  private call<T>(work: () => T): Outcome<T> {
    const now = snapshotOf(projectCanvas(this.document));
    const changes = {
      items: itemChanges(this.baseline.items, now.items),
      discussions: discussionChanges(this.baseline.discussions, now.discussions),
    };
    try {
      const result = work();
      return { status: "done", result, changes };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const refusal = error instanceof StaleError;
      return {
        status: refusal ? "refused" : "failed",
        reason: error.message,
        changes,
        ...(refusal ? { current: error.current } : {}),
      };
    } finally {
      changes.items.forEach((change) =>
        change.now
          ? this.seen.set(change.id, JSON.stringify(change.now))
          : this.seen.delete(change.id)
      );
      this.baseline = snapshotOf(projectCanvas(this.document));
    }
  }

  private refuseStale(index: CanvasIndex, operations: Operation[]) {
    const stale = new Map<string, DomainItem>();
    operations.flatMap(targetsOf).forEach((ref) => {
      const item = tryFind(index, ref);
      const seen = item && this.seen.get(item.id);
      if (item && seen !== undefined && seen !== JSON.stringify(item)) stale.set(item.id, item);
    });
    // An item seen once and removed since cannot be found, so it fails as missing instead.
    if (stale.size) throw new StaleError([...stale.values()]);
  }

  /**
   * Runs the operations on a private copy first, so a batch that fails partway never reaches the
   * people in the room as a change and its reversal.
   */
  private rehearse(operations: Operation[]) {
    const copy = new CanvasDocument();
    try {
      Y.applyUpdate(copy.doc, Y.encodeStateAsUpdate(this.document.doc));
      const context = new OperationContext(copy, this.author);
      copy.doc.transact(() => runAll(context, operations));
    } finally {
      copy.destroy();
    }
  }

  /** This session's own edits update what it has seen, so they never count against it. */
  private noteOwn(before: Snapshot) {
    const after = snapshotOf(projectCanvas(this.document));
    itemChanges(before.items, after.items).forEach((change) =>
      change.now
        ? this.seen.set(change.id, JSON.stringify(change.now))
        : this.seen.delete(change.id)
    );
  }
}

class StaleError extends DomainError {
  constructor(readonly current: DomainItem[]) {
    super(
      `Nothing was changed. Since you last saw them, someone else changed ${current
        .map((item) => `"${label(item)}"`)
        .join(", ")}. Their current state is attached; decide again and resend.`
    );
  }
}

function runAll(context: OperationContext, operations: Operation[]) {
  return operations.map((op, position) => numbered(position, () => runOperation(context, op)));
}

function numbered(position: number, work: () => string) {
  try {
    return work();
  } catch (error) {
    if (error instanceof DomainError)
      throw new DomainError(`Operation ${position + 1}: ${error.message} Nothing was changed.`);
    throw error;
  }
}

function tryFind(index: CanvasIndex, ref: string) {
  try {
    return index.find(ref);
  } catch {
    return null;
  }
}

function select(index: CanvasIndex, request: ReadRequest) {
  const { items } = index.canvas;
  if (request.items?.length) return request.items.map((ref) => index.find(ref));
  if (request.inside) {
    const holder = index.find(request.inside);
    const held = new Set(index.allContents(holder.id));
    return [holder, ...items.filter((item) => held.has(item.id))];
  }
  if (request.area) {
    const area = request.area;
    return items.filter((item) => isBoxItem(item) && overlapsArea(item, area));
  }
  return items;
}

function overlapsArea(item: Box, area: Box) {
  return (
    item.x < area.x + area.width &&
    area.x < item.x + item.width &&
    item.y < area.y + area.height &&
    area.y < item.y + item.height
  );
}

/** An item with what a reader needs to judge it: what it holds, its links and its overlaps. */
function withRelations(index: CanvasIndex, item: DomainItem) {
  const holds = index.contents(item.id).map((held) => held.id);
  const links = index.linksOf(item.id).map((link) => ({
    id: link.id,
    type: link.type,
    direction: link.from === item.id ? "out" : "in",
    other: label(index.byId.get(link.from === item.id ? link.to : link.from) ?? link),
  }));
  const overlaps = isBoxItem(item) ? index.overlaps(item).map(label) : [];
  return {
    ...item,
    ...(holds.length ? { holds } : {}),
    ...(links.length ? { links } : {}),
    ...(overlaps.length ? { overlaps } : {}),
  };
}
