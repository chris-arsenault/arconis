import { parseComment, type CanvasComment } from "../document/comments";
import { isId, newId } from "../document/ids";
import { isLink, type Item } from "../document/types";
import { BLANK, type Draft } from "./draft";
import { LanguageError } from "./lexer";
import { BAND_TITLE_ROOM, FRAME_PADDING, footprint, union } from "./layout";
import type { Attribute, LinkStatement, Segment, Statement } from "./syntax";

export interface PendingLink {
  from: string;
  to: string;
  segment: Segment;
  statement: LinkStatement;
}
export interface PendingBand {
  id: string;
  refs: string[];
  line: number;
}

/** Applies a line's attributes: style, look, bend points and where its label sits. */
export function describeLink(draft: Draft, item: Item, attributes: Attribute[], line: number) {
  for (const attribute of attributes) {
    if (attribute.kind === "word") {
      if (!draft.styles.has(attribute.word))
        throw new LanguageError(
          `"${attribute.word}" is not a style or an attribute of a line.`,
          line
        );
      item.style = attribute.word;
    } else if (attribute.kind === "look") {
      item.look = { ...item.look, ...attribute.look };
      attribute.cleared.forEach((key) => delete item.look[key]);
    } else if (attribute.kind === "via") item.points = attribute.points;
    else if (attribute.kind === "in") item.inside = draft.resolve(attribute.ref, line);
    else if (attribute.kind === "label") {
      item.x = attribute.x;
      item.y = attribute.y;
    } else throw new LanguageError(`A line cannot take "${attribute.kind}".`, line);
  }
}

/** A branch leaves its parent on the side facing its child. */
function branchPorts(draft: Draft, item: Item) {
  const parent = draft.items.get(item.from)!;
  const child = draft.items.get(item.to)!;
  const left = child.x + child.width / 2 < parent.x + parent.width / 2;
  item.fromPort = [left ? 0 : 1, 0.5];
  item.toPort = [left ? 1 : 0, 0.5];
}

/** The line a statement names with `as`, when it exists and the write may change it. */
function namedLine(draft: Draft, statement: LinkStatement, importing: boolean) {
  if (!statement.id || importing) return null;
  const existing = draft.items.get(draft.aliases.get(statement.id) ?? statement.id);
  if (existing && !isLink(existing))
    throw new LanguageError(`"${statement.id}" is not a line.`, statement.line);
  return existing ?? null;
}

/** An id for a new line: the one asked for when it is free, a fresh one otherwise. */
function newLineId(draft: Draft, requested: string | undefined, line: number) {
  if (requested === undefined) return draft.freshId();
  if (!isId(requested))
    throw new LanguageError(`"${requested}" cannot be an id: use letters, digits, _ and -.`, line);
  if (!draft.items.has(requested) && !draft.removed.has(requested)) return requested;
  const fresh = draft.freshId();
  draft.aliases.set(requested, fresh);
  return fresh;
}

function lineFor(draft: Draft, { segment, statement }: PendingLink, importing: boolean) {
  const existing = namedLine(draft, statement, importing);
  if (existing) return existing;
  const id = newLineId(draft, statement.id, statement.line);
  const item: Item = { ...BLANK, id, type: segment.type, order: draft.nextOrder() };
  draft.add(item, statement.id);
  return item;
}

/** `--` takes the arrow off a line; `->` restores a line's default arrow. */
function applyArrow(item: Item, segment: Segment) {
  if (segment.type !== "line") return;
  if (!segment.arrow) item.look = { ...item.look, arrow: "none" };
  else if (item.look.arrow === "none") delete item.look.arrow;
}

/** Creates or updates the lines a write declared, once every item they join exists. */
export function finishLinks(draft: Draft, links: PendingLink[], importing: boolean) {
  for (const pending of links) {
    const { from, to, segment, statement } = pending;
    const item = lineFor(draft, pending, importing);
    const isNew = draft.createdHere.has(item.id);
    Object.assign(item, { type: segment.type, from, to });
    if (segment.label !== undefined) item.name = segment.label;
    if (segment.from.port || isNew) item.fromPort = segment.from.port;
    if (segment.to.port || isNew) item.toPort = segment.to.port;
    applyArrow(item, segment);
    if (segment.type === "branch" && !item.fromPort && !item.toPort) branchPorts(draft, item);
    describeLink(draft, item, statement.attributes, statement.line);
  }
}

/**
 * Sizes each band to what it covers, and puts it in the innermost item holding all of that, just
 * behind the first of that holder's contents it crosses: behind what it covers, above what holds it.
 */
export function finishBands(draft: Draft, bands: PendingBand[]) {
  for (const { id, refs, line } of bands) {
    const band = draft.items.get(id)!;
    const covered = refs.map((ref) => draft.item(ref, line));
    const contents = union(covered.map((item) => footprint(item, draft.lookOf(item))))!;
    const room = (band.name || band.subtitle ? BAND_TITLE_ROOM : 0) + FRAME_PADDING / 2;
    Object.assign(band, {
      x: contents.x - FRAME_PADDING / 2,
      y: contents.y - room,
      width: contents.width + FRAME_PADDING,
      height: contents.height + room + FRAME_PADDING / 2,
    });
    const chains = covered.map((item) => draft.ancestors(item));
    band.inside = chains[0].find((holder) => chains.every((chain) => chain.includes(holder))) ?? "";
    const level = covered.map((item) => {
      const chain = [item.id, ...draft.ancestors(item)];
      const index = band.inside ? chain.indexOf(band.inside) : chain.length;
      return draft.items.get(chain[index - 1])!;
    });
    band.order = Math.min(...level.map((item) => item.order)) - 0.5;
  }
}

function newComment(
  draft: Draft,
  values: Pick<CanvasComment, "on" | "author" | "time" | "text"> & Partial<CanvasComment>
): CanvasComment {
  const taken = (id: string) =>
    draft.document.comments.has(id) || draft.comments.some((comment) => comment.id === id);
  return { id: newId(taken), thread: "", resolved: false, ...values };
}

function rootComment(draft: Draft, id: string, line: number) {
  const root =
    draft.comments.find((comment) => comment.id === id) ??
    parseComment(draft.document.comments.get(id));
  if (!root || root.thread) throw new LanguageError(`No discussion has the id "${id}".`, line);
  return root;
}

type Conversation = Extract<
  Statement,
  { kind: "view" | "discussion" | "comment" | "reply" | "resolve" }
>;
export type Speaker = { author: string; time: number; importing: boolean };

/** A discussion read from a file, keeping its comments' ids where they are free. */
function discussion(draft: Draft, statement: Extract<Statement, { kind: "discussion" }>) {
  const on = draft.resolve(statement.on, statement.line);
  let root = "";
  for (const { id: wanted, ...text } of statement.comments) {
    const resolved = !root && statement.resolved;
    const comment = newComment(draft, { ...text, on, thread: root, resolved });
    const taken =
      draft.document.comments.has(wanted ?? "") || draft.comments.some((c) => c.id === wanted);
    if (wanted && isId(wanted) && !taken) comment.id = wanted;
    draft.comments.push(comment);
    root ||= comment.id;
  }
}

const CONVERSE: {
  [K in Conversation["kind"]]: (
    draft: Draft,
    statement: Extract<Conversation, { kind: K }>,
    speaker: Speaker
  ) => void;
} = {
  // Restating a view's id changes it, except from a file, which adds its views beside these.
  view: (draft, statement, { importing }) => {
    const taken = importing && draft.document.views.has(statement.id ?? "");
    const free = statement.id && isId(statement.id) && !taken;
    draft.views.push({
      id: free ? statement.id! : newId((id) => draft.document.views.has(id)),
      name: statement.name,
      center: statement.center,
      zoom: statement.zoom,
    });
  },
  discussion,
  comment: (draft, statement, speaker) => {
    const on = draft.resolve(statement.on, statement.line);
    const { author, time } = speaker;
    draft.comments.push(newComment(draft, { on, author, time, text: statement.text }));
  },
  reply: (draft, statement, speaker) => {
    const root = rootComment(draft, statement.to, statement.line);
    draft.comments.push(
      newComment(draft, {
        on: root.on,
        thread: root.id,
        author: speaker.author,
        time: speaker.time,
        text: statement.text,
      })
    );
  },
  resolve: (draft, statement) => {
    const root = rootComment(draft, statement.id, statement.line);
    draft.comments.push({ ...root, resolved: statement.resolved });
  },
};

/** Discussions, comments and views. */
export function converse(draft: Draft, statement: Statement, speaker: Speaker) {
  const handler = CONVERSE[statement.kind as Conversation["kind"]] as
    ((draft: Draft, statement: Statement, speaker: Speaker) => void) | undefined;
  handler?.(draft, statement, speaker);
}
