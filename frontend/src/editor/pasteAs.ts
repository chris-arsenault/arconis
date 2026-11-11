import { quote } from "../language/printer";

/**
 * What pasted plain text can become: one text block, a note per line, or a topic tree read from
 * the lines' indentation. Each form is written in the canvas language, as an agent would write it.
 */

export type PasteForm = "text" | "notes" | "tree";

export interface OutlineLine {
  text: string;
  /** How far the line was indented, in steps of its own text's indentation units. */
  depth: number;
}

const NOTES_PER_ROW = 4;
const NOTE_GAP = 20;

/** Lines with their indentation, bullets and numbering stripped; blank lines are left out. */
export function outlineOf(text: string): OutlineLine[] {
  const lines = text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.trim());
  const indents = lines.map((line) => /^[ \t]*/.exec(line)![0].replaceAll("\t", "  ").length);
  const unit = Math.min(...indents.filter((indent) => indent > 0), Number.POSITIVE_INFINITY);
  return lines.map((line, index) => ({
    text: line.trim().replace(/^([-*•]|\d+[.)])\s+/, ""),
    depth: Number.isFinite(unit) ? Math.round(indents[index] / unit) : 0,
  }));
}

/** Whether the text reads as an outline: more than one line, at least one indented. */
export function isOutline(text: string) {
  const lines = outlineOf(text);
  return lines.length > 1 && lines.some((line) => line.depth > 0);
}

/** Statements for notes, one per line, in rows. */
function notesStatements(lines: OutlineLine[]) {
  const notes = lines.map((line) => `note ${quote(line.text)}`);
  return [`grid ${NOTES_PER_ROW} gap ${NOTE_GAP} {`, ...notes.map((note) => `  ${note}`), "}"];
}

/**
 * Statements for a tree. Under a selected topic, every top-level line branches from it; otherwise
 * the first line is the root and deeper lines branch from the nearest shallower one above them.
 */
export function treeStatements(lines: OutlineLine[], under = "") {
  const statements: string[] = [];
  const parents: string[] = [];
  let root = under;
  lines.forEach((line, index) => {
    const id = `p${index}`;
    while (parents.length > line.depth) parents.pop();
    const parent = parents[parents.length - 1];
    if (!parent && !under && index === 0) {
      statements.push(`node ${id} ${quote(line.text)}`);
      root = id;
    } else if (!parent && !under) statements.push(`${root} => node ${id} ${quote(line.text)}`);
    else statements.push(`${parent ?? under} => node ${id} ${quote(line.text)}`);
    parents[line.depth] = id;
    parents.length = line.depth + 1;
  });
  statements.push(`tidy ${root}`);
  return statements;
}

/** The canvas language for pasting `text` in the chosen form. */
export function pasteStatements(text: string, form: PasteForm, under = "") {
  const lines = outlineOf(text);
  if (form === "text" || !lines.length) return [`text ${quote(text.trim())} text-fit height`];
  if (form === "notes") return notesStatements(lines);
  return treeStatements(lines, under);
}
