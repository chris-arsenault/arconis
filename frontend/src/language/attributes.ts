import { describe, type Cursor } from "./cursor";
import type { Arrangement, Attribute, Edge } from "./syntax";
import { lookAttribute, type LookDefinition } from "./look";
import { INK_KINDS } from "../document/ink";
import { FLAGS, MARKERS, TASK_STATES, type Flag } from "../document/types";
import { DEFAULT_TIDY, TREE_DIRECTIONS, type TreeLayoutOptions } from "../document/treeLayout";
import { isId } from "../document/ids";
import { CLOCK_KINDS, readClock } from "../document/clock";
import { DEFAULT_GAP } from "../document/layout";

/** Parsing of the attributes that follow an item, a line or a style. */

type Side = "left" | "right" | "top" | "middle" | "bottom" | "center";
export const EDGES = new Set<Edge>(["top", "middle", "bottom", "left", "center", "right"]);
export const ARRANGEMENTS = new Set<Arrangement>(["row", "column", "grid"]);
export const STENCIL_WORDS = new Set([
  "rectangle",
  "ellipse",
  "decision",
  "service",
  "database",
  "cloud",
  "person",
  "junction",
]);

function beside(cursor: Cursor, side: Side): Attribute {
  const horizontal = side === "left" || side === "right";
  if (horizontal && cursor.word("of"))
    return {
      kind: "beside",
      direction: side === "left" ? "left of" : "right of",
      ref: cursor.ref(),
      gap: DEFAULT_GAP,
    };
  if (!cursor.word("with")) {
    const also = horizontal ? ` or "${side} of <id>"` : "";
    cursor.fail(`Write "${side} with <id>"${also}.`);
  }
  return { kind: "align", edge: side, ref: cursor.ref() };
}

function size(cursor: Cursor, dimension: "width" | "height"): Attribute {
  if (cursor.word("of")) return { kind: "match", dimension, ref: cursor.ref() };
  return {
    kind: "size",
    dimensions: { kind: dimension, value: cursor.number(`the ${dimension}`) },
  };
}

function offset(cursor: Cursor, kind: "by" | "nudge"): Attribute {
  const [dx, dy] = cursor.point("an offset");
  return { kind, dx, dy };
}

function picture(cursor: Cursor): Attribute {
  const hash = cursor.token.kind === "number" ? cursor.next().text : cursor.expectWord("a hash");
  if (!cursor.word("format")) cursor.fail('Write "hash <hash> format <media type>".');
  const format = cursor.expectWord("the picture's media type");
  return { kind: "picture", hash, format, stored: cursor.word("stored") };
}

/** `locked`, `collapsed` or `numbered`, each turned off with `off`. */
function flag(flag: Flag) {
  return (cursor: Cursor): Attribute => {
    const on = !cursor.word("off");
    cursor.word("on");
    return { kind: "flag", flag, value: on };
  };
}
/**
 * `clock time`, `clock stopwatch` or `clock timer <seconds>`, then optionally what it has counted
 * (`elapsed <seconds>`) and that it is going (`started <milliseconds>`, or `running` for now);
 * `clock none` removes it.
 */
function clockAttribute(cursor: Cursor): Attribute {
  if (cursor.word("none")) return { kind: "clock", clock: null, running: false };
  const kind = CLOCK_KINDS.find((candidate) => cursor.word(candidate));
  if (!kind) return cursor.fail(`After clock, write ${CLOCK_KINDS.join(", ")} or none.`);
  const duration = kind === "timer" ? cursor.number("the timer's length in seconds") : 0;
  const elapsed = cursor.word("elapsed") ? cursor.number("the seconds already counted") : 0;
  const started = cursor.word("started") ? cursor.number("when it started, in milliseconds") : 0;
  const clock = readClock({ kind, duration, elapsed, started });
  if (!clock) return cursor.fail("A clock's numbers are zero or more.");
  return { kind: "clock", clock, running: cursor.word("running") };
}

/**
 * The words after `tidy`: a direction, `compact` and `sorted`, in any order; null when there are
 * none. `left of` and `right of` place an item, so a direction followed by `of` is left alone.
 */
export function tidyOptions(cursor: Cursor): TreeLayoutOptions | null {
  const options = { ...DEFAULT_TIDY };
  let given = false;
  for (;;) {
    const word = cursor.isWord() ? cursor.token.text : "";
    const direction = TREE_DIRECTIONS.find((candidate) => candidate === word);
    if (direction && !cursor.isWord("of", cursor.peek())) options.direction = direction;
    else if (word === "compact") options.compact = true;
    else if (word === "sorted") options.sorted = true;
    else return given ? options : null;
    cursor.next();
    given = true;
  }
}

/** `tags a, b, c`: words people choose, id-like so they stay bare; `tags none` clears them. */
function tags(cursor: Cursor): Attribute {
  if (cursor.word("none")) return { kind: "tags", tags: [] };
  const tags = cursor.refList();
  for (const tag of tags)
    if (!isId(tag)) cursor.fail(`"${tag}" cannot be a tag: use letters, digits, _ and -.`);
  return { kind: "tags", tags: [...new Set(tags)] };
}

/** One of a fixed set of words, or `none` to clear the field. */
function choice<Value extends string>(
  cursor: Cursor,
  kind: "marker" | "task",
  values: readonly Value[],
  what: string
): Value {
  const value = cursor.expectWord(`${what} after ${kind}`);
  const found = values.find((candidate) => candidate === value);
  if (!found) cursor.fail(`Choose ${kind} ${values.join("|")}.`);
  return found;
}

/** A web address in quotes, or the bare id of an item, slide or view; `none` clears it. */
function link(cursor: Cursor): Attribute {
  if (cursor.word("none")) return { kind: "link", link: "" };
  if (cursor.kindIs("string")) return { kind: "link", link: cursor.next().text };
  return { kind: "link", link: cursor.expectWord("a web address in quotes or an item's id") };
}

/** `property owner "Ada"` sets a named value; `property owner none` removes it. */
function property(cursor: Cursor): Attribute {
  const key = cursor.expectWord("the property's name");
  if (!isId(key)) cursor.fail(`"${key}" cannot name a property: use letters, digits, _ and -.`);
  if (cursor.word("none")) return { kind: "property", key, edit: { kind: "remove" } };
  return {
    kind: "property",
    key,
    edit: { kind: "set", value: cursor.expectString("the property's value") },
  };
}

function edited(cursor: Cursor): Attribute {
  const by = cursor.expectString("the editor's name");
  cursor.keyword("at");
  return { kind: "edited", by, at: cursor.number("the time of the edit in milliseconds") };
}

const PARSERS: Record<string, (cursor: Cursor) => Attribute> = {
  ...Object.fromEntries(FLAGS.map((name) => [name, flag(name)])),
  tags,
  marker: (cursor) => ({
    kind: "marker",
    marker: choice(cursor, "marker", [...MARKERS, "none"] as const, "a marker"),
  }),
  task: (cursor) => ({
    kind: "task",
    task: choice(cursor, "task", [...TASK_STATES, "none"] as const, "open or done"),
  }),
  link,
  edited,
  property,
  markup: () => ({ kind: "markup", value: true }),
  workspace: () => ({ kind: "markup", value: false }),
  "scale-contents": (cursor) => {
    const value = !cursor.word("off");
    cursor.word("on");
    return { kind: "scaleContents", value };
  },
  tidy: (cursor) => {
    const options = tidyOptions(cursor);
    if (!options)
      return cursor.fail(`After tidy, write ${TREE_DIRECTIONS.join("|")}, compact or sorted.`);
    return { kind: "tidy", options };
  },
  clock: clockAttribute,
  target: (cursor) => ({ kind: "target", ref: cursor.ref() }),
  // Not bare `layer`: canvases already use that word as a style's name.
  "in-layer": (cursor) => ({ kind: "layer", ref: cursor.ref("a layer's id") }),
  ink: (cursor) => {
    const ink = cursor.expectWord("a drawing geometry");
    const found = INK_KINDS.find((kind) => kind === ink);
    if (!found) return cursor.fail(`Choose ink ${INK_KINDS.join("|")}.`);
    return { kind: "ink", ink: found };
  },
  at: (cursor) => {
    const [x, y] = cursor.point("a position");
    return { kind: "at", x, y };
  },
  size: (cursor) => {
    const [width, height] = cursor.point("a size as width,height");
    return { kind: "size", dimensions: { kind: "both", width, height } };
  },
  width: (cursor) => size(cursor, "width"),
  height: (cursor) => size(cursor, "height"),
  by: (cursor) => offset(cursor, "by"),
  nudge: (cursor) => offset(cursor, "nudge"),
  below: (cursor) => ({ kind: "beside", direction: "below", ref: cursor.ref(), gap: DEFAULT_GAP }),
  above: (cursor) => ({ kind: "beside", direction: "above", ref: cursor.ref(), gap: DEFAULT_GAP }),
  left: (cursor) => beside(cursor, "left"),
  right: (cursor) => beside(cursor, "right"),
  top: (cursor) => beside(cursor, "top"),
  middle: (cursor) => beside(cursor, "middle"),
  bottom: (cursor) => beside(cursor, "bottom"),
  center: (cursor) => beside(cursor, "center"),
  in: (cursor) => ({ kind: "in", ref: cursor.ref() }),
  over: (cursor) => ({ kind: "over", refs: cursor.refList() }),
  on: (cursor) => ({ kind: "on", ref: cursor.ref() }),
  icon: (cursor) => ({ kind: "icon", icon: cursor.iconKey() }),
  hash: picture,
  points: (cursor) => ({ kind: "points", points: cursor.points("the drawing's points") }),
  via: (cursor) => ({ kind: "via", points: cursor.points("bend points") }),
  free: () => ({ kind: "free" }),
  deck: (cursor) => {
    const deck = cursor.kindIs("string")
      ? cursor.next().text
      : cursor.expectWord("the deck's name");
    const numbering = cursor.kindIs("number")
      ? { kind: "number" as const, value: cursor.number("the slide's number") }
      : { kind: "next" as const };
    return { kind: "deck", deck, numbering };
  },
  "label-at": (cursor) => {
    const [x, y] = cursor.point("the label's position");
    return { kind: "label", x, y };
  },
};
const ATTRIBUTE_WORDS = new Set([...Object.keys(PARSERS), "gap", ...ARRANGEMENTS]);

/** Whether a word begins an attribute rather than being an item's id. */
export function isAttributeWord(word: string) {
  return ATTRIBUTE_WORDS.has(word) || lookAttribute(word) !== undefined || STENCIL_WORDS.has(word);
}

/** The rest of `row`, `column` or `grid N`: an optional edge members line up by. */
export function arrangeTail(cursor: Cursor, how: Arrangement, columns?: number): Attribute {
  const align =
    cursor.isWord() && EDGES.has(cursor.token.text as Edge)
      ? (cursor.next().text as Edge)
      : "center";
  return how === "grid"
    ? { kind: "arrange", how, columns: columns ?? 1, gap: DEFAULT_GAP, align: "center" }
    : { kind: "arrange", how, gap: DEFAULT_GAP, align };
}

function lookValue(
  cursor: Cursor,
  definition: Exclude<LookDefinition, { kind: "flag" | "number" }>
): string {
  const { word, kind } = definition;
  if (kind === "color") {
    if (cursor.token.kind === "color") return cursor.next().text;
    if (cursor.word("none")) return "none";
    cursor.fail(`Expected a color like #1f6feb, or none, after ${word}.`);
  }
  if (kind === "icon") return cursor.iconKey();
  const choices = Object.keys(definition.choices);
  const value = cursor.expectWord(`one of ${choices.join(", ")} after ${word}`);
  if (!choices.includes(value))
    cursor.fail(`"${value}" is not one of ${choices.join(", ")} after ${word}.`);
  return value;
}

function numericLook(cursor: Cursor, { word, range }: Extract<LookDefinition, { kind: "number" }>) {
  const value = cursor.number(`a number after ${word}`);
  const positive = range === "positive";
  const nonnegative = range === "nonnegative";
  if (!Number.isFinite(value) || (positive && value <= 0) || (nonnegative && value < 0))
    cursor.fail(`${word} must be a finite ${positive ? "positive" : "non-negative"} number.`);
  return value;
}

function look(cursor: Cursor): Attribute {
  const word = cursor.next().text;
  const { key, definition } = lookAttribute(word)!;
  if (definition.kind === "flag") {
    const on = !cursor.word("off");
    cursor.word("on");
    return { kind: "look", look: { [key]: on }, cleared: [] };
  }
  if (cursor.word("default")) return { kind: "look", look: {}, cleared: [key] };
  const value =
    definition.kind === "number" ? numericLook(cursor, definition) : lookValue(cursor, definition);
  return { kind: "look", look: { [key]: value }, cleared: [] };
}

/** `gap N` sets the gap of the placement or arrangement just before it. */
function gap(cursor: Cursor, previous: Attribute[]): Attribute {
  cursor.next();
  const value = cursor.number("a gap");
  const last = previous.at(-1);
  if (last?.kind !== "beside" && last?.kind !== "arrange")
    cursor.fail("`gap` follows a placement such as `below a` or an arrangement such as `row`.");
  last.gap = value;
  return previous.pop()!;
}

function attribute(cursor: Cursor, previous: Attribute[]): Attribute {
  const token = cursor.token;
  if (token.kind !== "word") cursor.fail(`Unexpected ${describe(token)}.`);
  const word = token.text;
  if (word === "gap") return gap(cursor, previous);
  if (lookAttribute(word)) return look(cursor);
  cursor.next();
  const parse = PARSERS[word];
  if (parse) return parse(cursor);
  if (ARRANGEMENTS.has(word as Arrangement))
    return arrangeTail(
      cursor,
      word as Arrangement,
      word === "grid" ? cursor.number("the grid's column count") : undefined
    );
  return { kind: "word", word };
}

/**
 * Attributes until the statement, a block or a line's end list ends. Commas may separate attributes,
 * except where they separate a line's ends; a string ends them, as a line's label or a mistake.
 */
export function attributes(cursor: Cursor, stopAtComma: boolean, leading: Attribute[] = []) {
  const result: Attribute[] = [...leading];
  while (!cursor.atStatementEnd() && !cursor.kindIs("arrow") && !cursor.kindIs("string")) {
    // At a line's end, `as` names the line rather than describing the item declared there.
    if (stopAtComma && cursor.isWord("as")) break;
    if (!cursor.isPunct(",")) result.push(attribute(cursor, result));
    else if (stopAtComma) break;
    else cursor.next();
  }
  return result;
}
