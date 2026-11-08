import type { ItemType, Port } from "../document/types";
import { TREE_DIRECTIONS, type TreeDirection } from "../document/treeLayout";
import { tokenize, type ArrowText } from "./lexer";
import { Cursor, describe } from "./cursor";
import {
  ARRANGEMENTS,
  EDGES,
  STENCIL_WORDS,
  arrangeTail,
  attributes,
  isAttributeWord,
} from "./attributes";
import {
  SIDES,
  DRAWING_WORDS,
  type ArrangeStatement,
  type Arrangement,
  type CommentText,
  type Edge,
  type EditStatement,
  type Endpoint,
  type ItemStatement,
  type LinkStatement,
  type LinkType,
  type Segment,
  type Statement,
} from "./syntax";

const ITEM_TYPES = new Set<string>([
  "node",
  "card",
  "frame",
  "group",
  "band",
  "text",
  "note",
  "picture",
  "slide",
  "drawing",
  "sketch",
  "highlight",
]);
const LINKS: Record<ArrowText, { type: LinkType; arrow: boolean; both?: boolean }> = {
  "<->": { type: "line", arrow: true, both: true },
  "->": { type: "line", arrow: true },
  "--": { type: "line", arrow: false },
  "=>": { type: "branch", arrow: false },
  "..>": { type: "reference", arrow: true },
};

/** Statements that start with a word of their own rather than an item. */
const SPECIAL: Record<string, (cursor: Cursor, line: number, word: string) => Statement> = {
  arconis: (cursor, line) => ({
    kind: "header",
    version: cursor.number("the language version"),
    line,
  }),
  title: (cursor, line) => ({
    kind: "title",
    title: cursor.expectString("the canvas title"),
    line,
  }),
  style: (cursor, line) => ({
    kind: "style",
    name: cursor.expectWord("the style's name"),
    attributes: attributes(cursor, false),
    line,
  }),
  delete: (cursor, line) => ({ kind: "delete", refs: cursor.refList(), line }),
  view: (cursor, line) => {
    const id = cursor.isWord() ? cursor.next().text : undefined;
    const name = cursor.expectString("the view's name");
    cursor.keyword("center");
    const [x, y] = cursor.point("the view's center");
    cursor.keyword("zoom");
    return { kind: "view", id, name, center: { x, y }, zoom: cursor.number("the zoom"), line };
  },
  discussion: discussion,
  comment: (cursor, line) => {
    cursor.keyword("on");
    return { kind: "comment", on: cursor.ref(), text: cursor.expectString("the comment"), line };
  },
  reply: (cursor, line) => ({
    kind: "reply",
    to: cursor.ref("a discussion's id"),
    text: cursor.expectString("the reply"),
    line,
  }),
  resolve: (cursor, line) => ({
    kind: "resolve",
    id: cursor.ref("a discussion's id"),
    resolved: true,
    line,
  }),
  reopen: (cursor, line) => ({
    kind: "resolve",
    id: cursor.ref("a discussion's id"),
    resolved: false,
    line,
  }),
  tidy: (cursor, line) => {
    const statement: Extract<Statement, { kind: "tidy" }> = {
      kind: "tidy",
      ref: cursor.ref(),
      line,
    };
    while (cursor.isWord()) {
      const word = cursor.next().text;
      if ((TREE_DIRECTIONS as string[]).includes(word)) statement.direction = word as TreeDirection;
      else if (word === "compact") statement.compact = true;
      else if (word === "sorted") statement.sorted = true;
      else cursor.fail(`After tidy <id>, write ${TREE_DIRECTIONS.join("|")}, compact or sorted.`);
    }
    return statement;
  },
  data: (cursor, line) => {
    const hash = cursor.token.kind === "number" ? cursor.next().text : cursor.expectWord("a hash");
    const format = cursor.expectWord("the picture's media type");
    return { kind: "data", hash, format, data: cursor.expectString("the picture in base64"), line };
  },
};

function discussion(cursor: Cursor, line: number): Statement {
  cursor.keyword("on");
  const on = cursor.ref();
  const resolved = cursor.word("resolved");
  if (!cursor.isPunct("{")) cursor.fail("A discussion lists its comments in a { block }.");
  cursor.next();
  const comments: CommentText[] = [];
  for (;;) {
    while (cursor.kindIs("end")) cursor.next();
    if (cursor.isPunct("}")) break;
    cursor.keyword("comment");
    const id = cursor.isWord() ? cursor.next().text : undefined;
    const author = cursor.expectString("the comment's author");
    cursor.keyword("at");
    const time = cursor.number("the comment's time in milliseconds");
    comments.push({ id, author, time, text: cursor.expectString("the comment") });
  }
  cursor.next();
  if (!comments.length) cursor.fail("A discussion needs at least one comment.");
  return { kind: "discussion", on, resolved, comments, line };
}

export function parse(source: string): Statement[] {
  return statements(new Cursor(tokenize(source)), false);
}

/** Statements up to the end of input, or to the closing brace of a block. */
function statements(cursor: Cursor, inBlock: boolean): Statement[] {
  const result: Statement[] = [];
  for (;;) {
    while (cursor.kindIs("end")) cursor.next();
    if (cursor.kindIs("eof")) {
      if (inBlock) cursor.fail("A block is missing its closing }.");
      return result;
    }
    if (cursor.isPunct("}")) {
      if (!inBlock) cursor.fail("A } has no block to close.");
      cursor.next();
      return result;
    }
    result.push(statement(cursor));
    if (!cursor.atStatementEnd())
      cursor.fail(`Unexpected ${describe(cursor.token)}; put each statement on its own line.`);
  }
}

function block(cursor: Cursor) {
  if (!cursor.isPunct("{")) return undefined;
  cursor.next();
  return statements(cursor, true);
}

function statement(cursor: Cursor): Statement {
  const token = cursor.token;
  if (token.kind !== "word") cursor.fail(`A statement cannot start with ${describe(token)}.`);
  const word = token.text;
  if (ITEM_TYPES.has(word)) {
    const item = itemStatement(cursor, false);
    if (cursor.kindIs("arrow")) return link(cursor, { item }, token.line);
    item.body = block(cursor);
    return item;
  }
  if (ARRANGEMENTS.has(word as Arrangement)) return arrangement(cursor);
  const startsLink = cursor.peek().kind === "arrow" || cursor.isPunct(".", cursor.peek());
  if (word === "edit" && !startsLink) {
    cursor.next();
    return edit(cursor, cursor.ref(), token.line);
  }
  const special = SPECIAL[word];
  if (special && !startsLink) {
    cursor.next();
    return special(cursor, token.line, word);
  }
  return reference(cursor, token.line);
}

/** A statement starting with an item's id: a line from it, or a change to it. */
function reference(cursor: Cursor, line: number): Statement {
  const ref = cursor.expectWord("an item's id");
  const from = port(cursor);
  if (cursor.kindIs("arrow")) return link(cursor, { ref, port: from }, line);
  if (from) cursor.fail("A port belongs at the end of a line, as in a.right -> b.");
  return edit(cursor, ref, line);
}

function names(cursor: Cursor, target: { name?: string; subtitle?: string }) {
  if (cursor.kindIs("string")) target.name = cursor.next().text;
  if (!cursor.isPunct("/")) return;
  cursor.next();
  target.subtitle = cursor.expectString("a subtitle");
}

function edit(cursor: Cursor, ref: string, line: number): EditStatement {
  const statement: EditStatement = { kind: "edit", ref, line, attributes: [] };
  names(cursor, statement);
  statement.attributes = attributes(cursor, false);
  statement.body = block(cursor);
  return statement;
}

/** Whether an arrow follows later on this statement's line, making an item a line's end. */
function linkAhead(cursor: Cursor) {
  for (const token of cursor.ahead()) {
    if (token.kind === "arrow") return true;
    if (cursor.isPunct("{", token)) return false;
  }
  return false;
}

/** An item. At an end of a line, a comma separates it from the next end. */
function itemStatement(cursor: Cursor, inLink: boolean): ItemStatement {
  const line = cursor.token.line;
  const type = cursor.next().text as ItemType;
  const statement: ItemStatement = { kind: "item", type, line, attributes: [] };
  // A stencil's name is the id of anything but a node, and of a node when a name follows it.
  const word = cursor.token.text;
  const stencilAsId =
    STENCIL_WORDS.has(word) && (type !== "node" || cursor.peek().kind === "string");
  const drawingId = DRAWING_WORDS.has(word) && cursor.peek().kind === "string";
  if (cursor.isWord() && (!isAttributeWord(word) || stencilAsId || drawingId))
    statement.id = cursor.next().text;
  names(cursor, statement);
  statement.attributes = attributes(cursor, inLink || linkAhead(cursor));
  return statement;
}

function arrangement(cursor: Cursor): ArrangeStatement {
  const line = cursor.token.line;
  const how = cursor.next().text as Arrangement;
  const columns = how === "grid" ? cursor.number("the grid's column count") : undefined;
  const word = cursor.token.text;
  const id =
    cursor.isWord() && !isAttributeWord(word) && !EDGES.has(word as Edge)
      ? cursor.next().text
      : undefined;
  const tail = arrangeTail(cursor, how, columns);
  const statement: ArrangeStatement = {
    kind: "arrange",
    how,
    columns,
    id,
    line,
    attributes: attributes(cursor, false, [tail]),
    body: [],
  };
  const body = block(cursor);
  if (!body) cursor.fail(`A ${how} needs a { block } of the items it arranges.`);
  statement.body = body;
  return statement;
}

function port(cursor: Cursor): Port | undefined {
  if (!cursor.isPunct(".")) return undefined;
  cursor.next();
  if (cursor.isPunct("(")) {
    cursor.next();
    const fractions = cursor.point("a port");
    if (!cursor.isPunct(")")) cursor.fail("A port's fractions end with ).");
    cursor.next();
    return fractions;
  }
  const side = cursor.expectWord("a side");
  if (!(side in SIDES))
    cursor.fail(`"${side}" is not a side; use ${Object.keys(SIDES).join(", ")} or .(x,y).`);
  return SIDES[side];
}

function endpoint(cursor: Cursor): Endpoint {
  if (cursor.isWord() && ITEM_TYPES.has(cursor.token.text)) {
    const item = itemStatement(cursor, true);
    return { item, port: port(cursor) };
  }
  const ref = cursor.expectWord("an item's id");
  return { ref, port: port(cursor) };
}

/** The ends after one arrow: one, or several separated by commas for a fan-out. */
function targets(cursor: Cursor, from: Endpoint, segments: Segment[]) {
  const { type, arrow, both } = LINKS[cursor.next().text as ArrowText];
  let to = from;
  do {
    if (cursor.isPunct(",")) cursor.next();
    to = endpoint(cursor);
    const segment: Segment = { from, to, type, arrow, both };
    if (cursor.kindIs("string")) segment.label = cursor.next().text;
    segments.push(segment);
  } while (cursor.isPunct(","));
  return to;
}

function link(cursor: Cursor, first: Endpoint, line: number): LinkStatement {
  const segments: Segment[] = [];
  let from = first;
  if (from.item && !from.port) from.port = port(cursor);
  while (cursor.kindIs("arrow")) from = targets(cursor, from, segments);
  const statement: LinkStatement = { kind: "link", segments, line, attributes: [] };
  if (cursor.word("as")) {
    statement.id = cursor.expectWord("the line's id");
    if (segments.length > 1) cursor.fail("`as` names one line; write one line per statement.");
    if (cursor.kindIs("string")) segments[0].label = cursor.next().text;
  }
  statement.attributes = attributes(cursor, false);
  return statement;
}
