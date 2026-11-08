import type { CanvasDocument } from "../document/canvasDocument";

export type TextAction =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "sup"
  | "sub"
  | "highlight"
  | "code"
  | "link"
  | "bullet"
  | "number"
  | "heading"
  | "fence"
  | "math"
  | "clear";
export interface SourceEdit {
  start: number;
  end: number;
  text: string;
  anchor: number;
  head: number;
}

const MARKERS: Partial<Record<TextAction, [string, string]>> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
  strike: ["~~", "~~"],
  sup: ["<sup>", "</sup>"],
  sub: ["<sub>", "</sub>"],
  highlight: ["<mark>", "</mark>"],
  code: ["`", "`"],
  math: ["$", "$"],
};

function replacement(
  start: number,
  end: number,
  text: string,
  anchor = start,
  head = start + text.length
): SourceEdit {
  return { start, end, text, anchor, head };
}

function wrap(source: string, start: number, end: number, [open, close]: [string, string]) {
  const selected = source.slice(start, end);
  if (
    source.slice(start - open.length, start) === open &&
    source.slice(end, end + close.length) === close
  )
    return replacement(
      start - open.length,
      end + close.length,
      selected,
      start - open.length,
      end - open.length
    );
  return replacement(start, end, open + selected + close, start + open.length, end + open.length);
}

function lineEdit(source: string, start: number, end: number, prefix: string) {
  const from = source.lastIndexOf("\n", start - 1) + 1;
  const next = source.indexOf("\n", end);
  const to = next < 0 ? source.length : next;
  const lines = source.slice(from, to).split("\n");
  const text = lines
    .map((line, index) => {
      const plain = line.replace(/^\s*(?:[-+*]|\d+[.)]|#{1,6})\s+/, "");
      return (prefix === "1. " ? `${index + 1}. ` : prefix) + plain;
    })
    .join("\n");
  return replacement(from, to, text);
}

/** Source commands never introduce an editor-private text model. */
export function sourceAction(
  source: string,
  start: number,
  end: number,
  action: TextAction,
  language = "typescript"
): SourceEdit {
  const markers = MARKERS[action];
  if (markers) return wrap(source, start, end, markers);
  if (action === "link") return wrap(source, start, end, ["[", "](https://example.org)"]);
  if (action === "bullet") return lineEdit(source, start, end, "- ");
  if (action === "number") return lineEdit(source, start, end, "1. ");
  if (action === "heading") return lineEdit(source, start, end, "## ");
  const selected = source.slice(start, end);
  if (action === "clear") return replacement(start, end, clearMarkdown(selected));
  const longest = Math.max(2, ...[...selected.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  const leading = start > 0 && source[start - 1] !== "\n" ? "\n" : "";
  const open = `${leading}${fence}${language}\n`;
  const text = `${open}${selected}\n${fence}\n`;
  return replacement(start, end, text, start + open.length, end + open.length);
}

function clearMarkdown(source: string) {
  return source
    .replace(/<\/?(?:u|sub|sup|mark)>/g, "")
    .replace(/(\*\*|~~|`)(.*?)\1/g, "$2")
    .replace(/\*([^*]+)\*/g, "$1");
}

/** One toolbar command is one local Undo action, shared by the source editors. */
export function applySourceEdit(
  document: CanvasDocument,
  id: string,
  element: HTMLTextAreaElement,
  edit: SourceEdit
) {
  const source = element.value;
  element.focus({ preventScroll: true });
  document.undo.stopCapturing();
  document.editText(id, source.slice(0, edit.start) + edit.text + source.slice(edit.end));
  document.undo.stopCapturing();
  element.setSelectionRange(edit.anchor, edit.head);
}

function inFence(source: string, position: number) {
  let delimiter = "";
  for (const line of source.slice(0, position).split("\n")) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!match) continue;
    if (!delimiter) delimiter = match[1];
    else if (match[1][0] === delimiter[0] && match[1].length >= delimiter.length) delimiter = "";
  }
  return Boolean(delimiter);
}

/** Returns null when a key belongs to the browser or to the canvas's topic shortcuts. */
export function structuralKey(
  source: string,
  start: number,
  end: number,
  key: string,
  shift = false
): SourceEdit | null {
  if (!["Tab", "Enter"].includes(key)) return null;
  const from = source.lastIndexOf("\n", start - 1) + 1;
  const line = source.slice(
    from,
    source.indexOf("\n", start) < 0 ? source.length : source.indexOf("\n", start)
  );
  const list = /^([ \t]*)([-+*]|\d+[.)]) ([^\n]*)$/.exec(line);
  const code = inFence(source, from);
  if (key === "Tab" && (list || code)) return indent(source, start, end, shift);
  if (key !== "Enter" || !list || code) return null;
  return listEnter(list, from, start, end, shift);
}

function listEnter(
  list: RegExpExecArray,
  from: number,
  start: number,
  end: number,
  shift: boolean
) {
  const [prefix, spacing, marker, content] = list;
  if (!content.trim() && !shift) {
    const next = spacing.length ? spacing.replace(/^(?: {1,4}|\t)/, "") + marker + " " : "";
    return replacement(from, from + prefix.length, next, from + next.length, from + next.length);
  }
  const next = /^\d/.test(marker) ? marker.replace(/\d+/, (n) => String(Number(n) + 1)) : marker;
  const insert = shift ? `  \n${spacing}${" ".repeat(marker.length + 1)}` : `\n${spacing}${next} `;
  return replacement(start, end, insert, start + insert.length, start + insert.length);
}

function indent(source: string, start: number, end: number, outdent: boolean) {
  const from = source.lastIndexOf("\n", start - 1) + 1;
  const through = end > start && source[end - 1] === "\n" ? end - 1 : end;
  const to = source.indexOf("\n", through);
  const stop = to < 0 ? source.length : to;
  const selected = source.slice(from, stop);
  const rewrite = (text: string) =>
    text
      .split("\n")
      .map((line) => (outdent ? line.replace(/^(?: {1,4}|\t)/, "") : `    ${line}`))
      .join("\n");
  const text = rewrite(selected);
  const offset = (position: number) =>
    position > stop
      ? position + text.length - selected.length
      : from + rewrite(source.slice(from, position)).length;
  return replacement(from, stop, text, offset(start), offset(end));
}
