import type { Look } from "../document/types";
import { describe, type Cursor } from "./cursor";
import { LOOK_FLAGS, LOOK_WORDS, type Arrangement, type Attribute, type Edge } from "./syntax";

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

const NUMERIC = new Set<keyof Look>(["lineWidth", "textSize", "rotation", "opacity", "scale"]);
const COLORED = new Set<keyof Look>(["fill", "line", "textColor", "iconColor"]);
const CHOICES: Partial<Record<keyof Look, string[]>> = {
  align: ["left", "center", "right"],
  title: ["header", "top", "side"],
  path: ["cornered", "diagonal", "curved"],
  arrow: ["arrow", "open", "none"],
  startArrow: ["arrow", "open", "none"],
};

function beside(cursor: Cursor, side: Side): Attribute {
  const horizontal = side === "left" || side === "right";
  if (horizontal && cursor.word("of"))
    return {
      kind: "beside",
      direction: side === "left" ? "left of" : "right of",
      ref: cursor.ref(),
    };
  if (!cursor.word("with")) {
    const also = horizontal ? ` or "${side} of <id>"` : "";
    cursor.fail(`Write "${side} with <id>"${also}.`);
  }
  return { kind: "align", edge: side, ref: cursor.ref() };
}

function size(cursor: Cursor, dimension: "width" | "height"): Attribute {
  if (cursor.word("of")) return { kind: "match", dimension, ref: cursor.ref() };
  return { kind: "size", [dimension]: cursor.number(`the ${dimension}`) };
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

const PARSERS: Record<string, (cursor: Cursor) => Attribute> = {
  at: (cursor) => {
    const [x, y] = cursor.point("a position");
    return { kind: "at", x, y };
  },
  size: (cursor) => {
    const [width, height] = cursor.point("a size as width,height");
    return { kind: "size", width, height };
  },
  width: (cursor) => size(cursor, "width"),
  height: (cursor) => size(cursor, "height"),
  by: (cursor) => offset(cursor, "by"),
  nudge: (cursor) => offset(cursor, "nudge"),
  below: (cursor) => ({ kind: "beside", direction: "below", ref: cursor.ref() }),
  above: (cursor) => ({ kind: "beside", direction: "above", ref: cursor.ref() }),
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
    const slide = cursor.kindIs("number") ? cursor.number("the slide's number") : undefined;
    return { kind: "deck", deck, slide };
  },
  "label-at": (cursor) => {
    const [x, y] = cursor.point("the label's position");
    return { kind: "label", x, y };
  },
};
const ATTRIBUTE_WORDS = new Set([...Object.keys(PARSERS), "gap", ...ARRANGEMENTS]);

/** Whether a word begins an attribute rather than being an item's id. */
export function isAttributeWord(word: string) {
  return (
    ATTRIBUTE_WORDS.has(word) || word in LOOK_WORDS || word in LOOK_FLAGS || STENCIL_WORDS.has(word)
  );
}

/** The rest of `row`, `column` or `grid N`: an optional edge members line up by. */
export function arrangeTail(cursor: Cursor, how: Arrangement, columns?: number): Attribute {
  const attribute: Attribute & { kind: "arrange" } = { kind: "arrange", how, columns };
  if (cursor.isWord() && EDGES.has(cursor.token.text as Edge))
    attribute.align = cursor.next().text as Edge;
  return attribute;
}

function lookValue(cursor: Cursor, word: string, key: keyof Look): unknown {
  if (NUMERIC.has(key)) return cursor.number(`a number after ${word}`);
  if (COLORED.has(key)) {
    if (cursor.token.kind === "color") return cursor.next().text;
    if (cursor.word("none")) return "none";
    cursor.fail(`Expected a color like #1f6feb, or none, after ${word}.`);
  }
  if (key === "badge") return cursor.iconKey();
  const choices = CHOICES[key] ?? [];
  const value = cursor.expectWord(`one of ${choices.join(", ")} after ${word}`);
  if (!choices.includes(value))
    cursor.fail(`"${value}" is not one of ${choices.join(", ")} after ${word}.`);
  return value;
}

function look(cursor: Cursor): Attribute {
  const word = cursor.next().text;
  if (word in LOOK_FLAGS) {
    const key = LOOK_FLAGS[word as keyof typeof LOOK_FLAGS];
    const on = !cursor.word("off");
    cursor.word("on");
    return { kind: "look", look: { [key]: on }, cleared: [] };
  }
  const key = LOOK_WORDS[word as keyof typeof LOOK_WORDS];
  if (cursor.word("default")) return { kind: "look", look: {}, cleared: [key] };
  return { kind: "look", look: { [key]: lookValue(cursor, word, key) } as Look, cleared: [] };
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
  if (word in LOOK_WORDS || word in LOOK_FLAGS) return look(cursor);
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
    if (!cursor.isPunct(",")) result.push(attribute(cursor, result));
    else if (stopAtComma) break;
    else cursor.next();
  }
  return result;
}
