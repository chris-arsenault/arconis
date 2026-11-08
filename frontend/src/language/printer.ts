import type { CanvasDocument } from "../document/canvasDocument";
import { listComments, type CanvasComment } from "../document/comments";
import { deckOf } from "../document/slides";
import {
  isLink,
  type Arrangement,
  type Item,
  type Look,
  type Port,
  type View,
} from "../document/types";
import { LOOK_FLAGS, LOOK_WORDS, SIDES } from "./syntax";

/**
 * Writes canvas items as statements of the canvas language. The printed form is canonical: an item
 * that has not changed always prints the same, so comparing printed items finds changes.
 */
export const LANGUAGE_VERSION = 1;

const INDENT = "  ";
const BARE = /^[A-Za-z_][A-Za-z0-9_:/-]*$/;

export function quote(text: string) {
  if (text.includes("\n")) return rawQuote(text);
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n").replaceAll("\t", "\\t")}"`;
}

/** Raw strings frame, rather than escape, Markdown and LaTeX. Pick a collision-free delimiter. */
function rawQuote(text: string) {
  const longest = Math.max(2, ...[...text.matchAll(/"+/g)].map((match) => match[0].length));
  const delimiter = '"'.repeat(longest + 1);
  return `${delimiter}\n${text}\n${delimiter}`;
}

/** A word as written: bare when the language reads it as one word, quoted otherwise. */
function word(text: string) {
  return BARE.test(text) && !text.includes("--") && !text.includes("->") ? text : quote(text);
}

export function number(value: number) {
  return String(Math.round(value * 1e6) / 1e6);
}
function pair(x: number, y: number) {
  return `${number(x)},${number(y)}`;
}

const LOOK_ORDER: (keyof Look)[] = [
  "fill",
  "line",
  "lineWidth",
  "dashed",
  "opacity",
  "textColor",
  "textSize",
  "font",
  "valign",
  "textHighlight",
  "lineHeight",
  "paragraphGap",
  "padding",
  "textFit",
  "bold",
  "italic",
  "underline",
  "strike",
  "align",
  "vertical",
  "rotation",
  "iconColor",
  "badge",
  "title",
  "path",
  "arrow",
  "startArrow",
  "scale",
];
const WORD_FOR = new Map<keyof Look, string>([
  ...Object.entries(LOOK_WORDS).map(([text, key]) => [key, text] as [keyof Look, string]),
  ...Object.entries(LOOK_FLAGS).map(([text, key]) => [key, text] as [keyof Look, string]),
]);

/** Look properties as attributes. `skip` leaves out ones the statement already says another way. */
export function lookWords(look: Look, skip: (keyof Look)[] = []) {
  const parts: string[] = [];
  for (const key of LOOK_ORDER) {
    const value = look[key];
    if (value === undefined || skip.includes(key)) continue;
    const name = WORD_FOR.get(key)!;
    if (typeof value === "boolean") parts.push(value ? name : `${name} off`);
    else if (typeof value === "number") parts.push(`${name} ${number(value)}`);
    else if (key === "badge") parts.push(`${name} ${value ? word(value) : "none"}`);
    else parts.push(`${name} ${value}`);
  }
  return parts;
}

function names(item: Item) {
  const parts: string[] = [];
  if (item.name || item.subtitle) parts.push(quote(item.name));
  if (item.subtitle) parts.push("/", quote(item.subtitle));
  return parts;
}

function portText(port: Port | undefined) {
  if (!port) return "";
  const side = Object.entries(SIDES).find(
    ([, value]) => value[0] === port[0] && value[1] === port[1]
  );
  return side ? `.${side[0]}` : `.(${pair(port[0], port[1])})`;
}

/** Whether a line is `<->`: the default arrow at its end and an arrow at its start. */
function bothEnds(item: Item) {
  return item.type === "line" && item.look.startArrow === "arrow" && item.look.arrow === undefined;
}

function arrowOf(item: Item) {
  if (item.type === "branch") return "=>";
  if (item.type === "reference") return "..>";
  if (bothEnds(item)) return "<->";
  return item.look.arrow === "none" ? "--" : "->";
}

/** Look properties the line's arrow already says. */
function arrowSkips(item: Item): (keyof Look)[] {
  if (bothEnds(item)) return ["startArrow"];
  return item.type === "line" && item.look.arrow === "none" ? ["arrow"] : [];
}

/** A line's statement. `present` limits its holder to items printed with it. */
export function linkStatement(item: Item, present?: Set<string>) {
  const parts = [
    `${item.from}${portText(item.fromPort)}`,
    arrowOf(item),
    `${item.to}${portText(item.toPort)}`,
  ];
  if (item.name) parts.push(quote(item.name));
  parts.push("as", item.id);
  if (item.style) parts.push(item.style);
  parts.push(...lookWords(item.look, arrowSkips(item)), ...route(item, present));
  return parts.join(" ");
}

/** Where a line runs: bend points, its label's place, and the group it moves with. */
function route(item: Item, present?: Set<string>) {
  const parts: string[] = [];
  if (item.points.length) parts.push("via", ...item.points.map(([x, y]) => pair(x, y)));
  if (item.x || item.y) parts.push("label-at", pair(item.x, item.y));
  if (item.inside && (!present || present.has(item.inside))) parts.push("in", item.inside);
  return parts;
}

/** What an item is beyond its type: stencil, style, icon, the line it sits on, its picture. */
function identity(item: Item) {
  const parts: string[] = [];
  if (item.type === "node" && item.stencil !== "rectangle" && item.stencil !== "icon")
    parts.push(item.stencil);
  if (item.style) parts.push(item.style);
  if (item.icon) parts.push("icon", word(item.icon));
  if (item.onLine) parts.push("on", item.onLine);
  if (item.picture) parts.push("hash", item.picture.hash, "format", item.picture.format);
  if (item.picture?.stored) parts.push("stored");
  return [...parts, ...deckWords(item)];
}

/** A slide's deck and number; nothing for other items. */
function deckWords(item: Item) {
  return item.type === "slide" ? ["deck", word(deckOf(item)), number(item.slide ?? 0)] : [];
}

/** A kept arrangement: `row`, `column` or `grid N`, then how members line up and their gap. */
function arrangeWords({ how, columns, align, gap }: Arrangement) {
  const parts: string[] = how === "grid" ? [how, number(columns ?? 1)] : [how];
  if (align) parts.push(align);
  if (gap !== undefined) parts.push("gap", number(gap));
  return parts;
}

/** One item's statement, without what it holds. `standalone` names its holder with `in`. */
export function itemStatement(item: Item, standalone = false) {
  if (isLink(item)) return linkStatement(item);
  const parts: string[] = [item.type, item.id, ...names(item), ...identity(item)];
  if (item.arrange) parts.push(...arrangeWords(item.arrange));
  parts.push(...lookWords(item.look));
  if (item.type === "drawing") parts.push("points", ...item.points.map(([x, y]) => pair(x, y)));
  else parts.push("at", pair(item.x, item.y), "size", pair(item.width, item.height));
  if (standalone && item.inside) parts.push("in", item.inside);
  return parts.join(" ");
}

function printTree(items: Item[], lines: string[]) {
  const present = new Set(items.map((item) => item.id));
  const children = new Map<string, Item[]>();
  for (const item of items) {
    if (isLink(item)) continue;
    const holder = present.has(item.inside) ? item.inside : "";
    children.set(holder, [...(children.get(holder) ?? []), item]);
  }
  const visit = (item: Item, depth: number) => {
    const held = children.get(item.id) ?? [];
    const statement = INDENT.repeat(depth) + itemStatement(item);
    if (!held.length) {
      lines.push(statement);
      return;
    }
    lines.push(`${statement} {`);
    held.forEach((child) => visit(child, depth + 1));
    lines.push(`${INDENT.repeat(depth)}}`);
  };
  (children.get("") ?? []).forEach((item) => visit(item, 0));
  items.filter(isLink).forEach((item) => lines.push(linkStatement(item, present)));
}

export function discussionStatements(comments: CanvasComment[]) {
  const lines: string[] = [];
  for (const root of comments.filter((comment) => !comment.thread)) {
    lines.push(`discussion on ${root.on}${root.resolved ? " resolved" : ""} {`);
    for (const comment of [root, ...comments.filter((reply) => reply.thread === root.id)])
      lines.push(
        `${INDENT}comment ${comment.id} ${quote(comment.author)} at ${comment.time} ${quote(comment.text)}`
      );
    lines.push("}");
  }
  return lines;
}

export function viewStatement(view: View) {
  return `view ${view.id} ${quote(view.name)} center ${pair(view.center.x, view.center.y)} zoom ${number(view.zoom)}`;
}

export function styleStatements(document: CanvasDocument, used?: Set<string>) {
  return [...document.styles.entries()]
    .filter(([name]) => !used || used.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, look]) => ["style", name, ...lookWords(look)].join(" "));
}

/** Items in stacking order, nested by what holds them, with their links after. */
export function printItems(items: Item[]) {
  const lines: string[] = [];
  printTree(items, lines);
  return lines.join("\n");
}

export interface PrintOptions {
  /** Only these items, with what they hold; everything when empty. */
  ids?: string[];
  /** Picture bytes to carry, for a file that must open anywhere. */
  data?: { hash: string; type: string; data: string }[];
}

/** The canvas, or part of it, as a complete text: the saved file and what agents read. */
export function printCanvas(document: CanvasDocument, options: PrintOptions = {}) {
  const all = document.list();
  const chosen = chosenItems(all, options.ids ?? []);
  const ids = new Set(chosen.map((item) => item.id));
  const used = new Set(chosen.map((item) => item.style).filter(Boolean));
  const whole = !options.ids?.length;
  const lines = [`arconis ${LANGUAGE_VERSION}`, `title ${quote(document.title())}`];
  lines.push(...styleStatements(document, whole ? undefined : used));
  printTree(chosen, lines);
  lines.push(...discussionStatements(listComments(document).filter((c) => ids.has(c.on))));
  if (whole) lines.push(...[...document.views.values()].map(viewStatement));
  for (const picture of options.data ?? [])
    lines.push(`data ${picture.hash} ${picture.type} ${quote(picture.data)}`);
  return `${lines.join("\n")}\n`;
}

/** The named items with everything they hold, and the links among them. */
export function chosenItems(all: Item[], ids: string[]) {
  if (!ids.length) return all;
  const chosen = new Set(ids);
  let size = -1;
  while (size !== chosen.size) {
    size = chosen.size;
    all
      .filter((item) => chosen.has(item.inside) || chosen.has(item.onLine))
      .forEach((item) => chosen.add(item.id));
  }
  return all.filter(
    (item) => chosen.has(item.id) || (isLink(item) && chosen.has(item.from) && chosen.has(item.to))
  );
}
