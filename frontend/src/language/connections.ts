import { parseComment, type CanvasComment } from "../document/comments";
import { isId, newId } from "../document/ids";
import { isLink, type Item } from "../document/types";
import type { Draft } from "./draft";
import { BLANK } from "../document/canvasDocument";
import { LanguageError } from "./lexer";
import { BAND_TITLE_ROOM, FRAME_PADDING, footprint, union } from "../document/layout";
import type { Attribute, LinkStatement, Segment, Statement } from "./syntax";
import type { Conversation } from "./effects";
import { attributesFor, checkAttributes, type RoutedAttribute } from "./attributeRouting";
import { describeField, isFieldAttribute } from "./fields";
import { assignLayer } from "./layerWriting";
import { requestedId } from "./syntax";

export interface PendingLink {
  from: string;
  to: string;
  segment: Segment;
  statement: LinkStatement;
}
/**
 * Lines a write has declared but not yet settled, as branch and line items, so placing and
 * tidying a tree written in one go sees the tree it is building.
 */
export function pendingLinkItems(links: PendingLink[]): Item[] {
  return links.map(({ from, to, segment }, index) => ({
    ...BLANK,
    id: `pending link ${index}`,
    type: segment.type,
    from,
    to,
  }));
}

export interface PendingBand {
  id: string;
  refs: string[];
  line: number;
}

/** A bare word on a line names its style; nothing else is bare there. */
function lineStyle(draft: Draft, word: string, line: number) {
  if (!draft.styles.has(word))
    throw new LanguageError(`"${word}" is not a style or an attribute of a line.`, line);
  return word;
}

/** The holder `in` names, with `none` meaning the top level. */
function holderOf(draft: Draft, ref: string, line: number) {
  return ref === "none" ? "" : draft.resolve(ref, line);
}

/** Applies a line's attributes: style, look, bend points, fields and where its label sits. */
export function describeLink(draft: Draft, item: Item, attributes: Attribute[], line: number) {
  checkAttributes("link", attributes, line);
  for (const attribute of attributesFor(attributes, "link", "link")) {
    // `around` places a line's points once every item is placed; the writer does that.
    if (attribute.kind === "word" && attribute.word === "around") continue;
    if (attribute.kind === "word") item.style = lineStyle(draft, attribute.word, line);
    else if (attribute.kind === "look") {
      item.look = { ...item.look, ...attribute.look };
      attribute.cleared.forEach((key) => delete item.look[key]);
    } else if (attribute.kind === "via") item.points = attribute.points;
    else if (attribute.kind === "in") item.inside = holderOf(draft, attribute.ref, line);
    else if (attribute.kind === "label") {
      item.x = attribute.x;
      item.y = attribute.y;
    } else describeLinkField(draft, item, attribute, line);
  }
}

/** The fields a line carries as every item does, and its layer. */
function describeLinkField(
  draft: Draft,
  item: Item,
  attribute: Exclude<
    RoutedAttribute<"link", "link">,
    { kind: "word" | "look" | "via" | "in" | "label" }
  >,
  line: number
) {
  if (attribute.kind === "layer") assignLayer(draft, item, attribute.ref, line);
  else if (isFieldAttribute(attribute)) describeField(item, attribute);
  else {
    const unhandled: never = attribute;
    throw new Error("Unhandled line attribute", { cause: unhandled });
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
  const id = requestedId(statement.identity);
  if (!id || importing) return null;
  const existing = draft.items.get(draft.aliases.get(id) ?? id);
  if (existing && !isLink(existing))
    throw new LanguageError(`"${id}" is not a line.`, statement.line);
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
  const requested = requestedId(statement.identity);
  const id = newLineId(draft, requested || undefined, statement.line);
  const item: Item = { ...BLANK, id, type: segment.type, order: draft.nextOrder() };
  draft.add(item, requested);
  return item;
}

/**
 * `--` takes the arrow off a line, `->` restores the default arrow at its end, and `<->` adds one at
 * its start. A start-arrow attribute after the ends still applies over these.
 */
function applyArrow(item: Item, segment: Segment) {
  if (segment.type !== "line") return;
  const look = { ...item.look };
  if (!segment.arrow) look.arrow = "none";
  else if (look.arrow === "none") delete look.arrow;
  if (segment.both) look.startArrow = "arrow";
  else delete look.startArrow;
  item.look = look;
}

/**
 * Creates or updates the lines a write declared, once every item they join exists. Returns the ids
 * of lines to route around items.
 */
export function finishLinks(draft: Draft, links: PendingLink[], importing: boolean) {
  const around: string[] = [];
  for (const pending of links) {
    const { segment, statement } = pending;
    const item = lineFor(draft, pending, importing);
    joinEnds(draft, item, pending);
    applyArrow(item, segment);
    describeLink(draft, item, statement.attributes, statement.line);
    if (draft.createdHere.has(item.id) && !statement.attributes.some((a) => a.kind === "in"))
      item.inside = sharedHolder(draft, item);
    if (statement.attributes.some((a) => a.kind === "word" && a.word === "around"))
      around.push(item.id);
  }
  return around;
}

/**
 * The innermost item holding both of a line's ends, as a line drawn in the editor joins it, so a
 * diagram inside a frame or slide moves, folds and presents as one.
 */
function sharedHolder(draft: Draft, item: Item) {
  const ends = [item.from, item.to].map((id) => draft.items.get(id));
  if (ends.some((end) => !end)) return "";
  const chains = ends.map((end) => draft.ancestors(end!));
  return chains[0].find((holder) => chains.every((chain) => chain.includes(holder))) ?? "";
}

/** A line's ends, ports and label. Ports a restatement leaves out stay as they were. */
function joinEnds(draft: Draft, item: Item, { from, to, segment }: PendingLink) {
  const isNew = draft.createdHere.has(item.id);
  Object.assign(item, { type: segment.type, from, to });
  if (segment.label.kind === "set") item.name = segment.label.value;
  if (segment.from.port !== null || isNew) item.fromPort = segment.from.port;
  if (segment.to.port !== null || isNew) item.toPort = segment.to.port;
  if (segment.type === "branch" && !item.fromPort && !item.toPort) branchPorts(draft, item);
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

export type Speaker = { author: string; time: number; importing: boolean };

/** A discussion read from a file, keeping its comments' ids where they are free. */
function discussion(draft: Draft, statement: Extract<Statement, { kind: "discussion" }>) {
  const on = draft.resolve(statement.on, statement.line);
  let root = "";
  for (const { identity, ...text } of statement.comments) {
    const wanted = requestedId(identity);
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

export function converse(draft: Draft, statement: Conversation, speaker: Speaker) {
  const handler = CONVERSE[statement.kind] as (
    draft: Draft,
    statement: Conversation,
    speaker: Speaker
  ) => void;
  handler(draft, statement, speaker);
}
