import type { OutlineLine } from "../editor/pasteAs";
import { DiagramBuilder, memberLabel, type Imported } from "./builder";
import { arrowOf, canvasColor, type Diagram, type DiagramShape } from "./diagram";
import { TextCursor, afterWord, linesOf, splitOnce, stripTags } from "./text";

/**
 * PlantUML's element-and-relation diagrams (component, deployment, use case, class, state and
 * sequence) and its mind map. A sequence diagram becomes its participants joined by numbered
 * messages.
 */

const ELEMENTS: Record<string, DiagramShape> = {
  actor: "person",
  person: "person",
  participant: "rectangle",
  boundary: "rectangle",
  control: "rectangle",
  entity: "rectangle",
  collections: "rectangle",
  component: "service",
  interface: "ellipse",
  usecase: "ellipse",
  circle: "ellipse",
  database: "database",
  queue: "database",
  storage: "database",
  stack: "rectangle",
  cloud: "cloud",
  node: "rectangle",
  rectangle: "rectangle",
  package: "rectangle",
  folder: "rectangle",
  frame: "rectangle",
  agent: "rectangle",
  artifact: "rectangle",
  card: "rectangle",
  file: "rectangle",
  hexagon: "rectangle",
  label: "text",
  class: "rectangle",
  enum: "rectangle",
  object: "rectangle",
  state: "rectangle",
  annotation: "rectangle",
  protocol: "rectangle",
  struct: "rectangle",
};

/** Elements whose braces list members rather than hold other elements. */
const MEMBERED = new Set([
  "class",
  "enum",
  "object",
  "entity",
  "interface",
  "annotation",
  "struct",
]);
/** Membered elements that are named above their members for what they are. */
const STEREOTYPED = new Set(["enum", "interface", "annotation", "struct"]);
/** Elements only a sequence diagram declares. */
const SEQUENCE = new Set(["participant", "boundary", "control", "collections"]);

/** The pairs that wrap a name and say what it is. */
const WRAPPERS: { open: string; close: string; shape: DiagramShape | null }[] = [
  { open: '"', close: '"', shape: null },
  { open: "[", close: "]", shape: "service" },
  { open: "(", close: ")", shape: "ellipse" },
  { open: ":", close: ":", shape: "person" },
];

interface Name {
  text: string;
  /** What the name's wrapping makes it, or null when it is bare or quoted. */
  shape: DiagramShape | null;
  wrapped: boolean;
}

const ARROW_CHARS = "<>-.=~ox*#+^|{}\\/";
const isBareName = (char: string) => /^[\w.@$]$/.test(char);

/** Reads PlantUML names, and the arrows between them, off a line. */
class UmlCursor extends TextCursor {
  /** A quoted, wrapped or bare name; null when none starts here. */
  name(): Name | null {
    this.skipSpace();
    if (this.take("[*]")) return { text: "[*]", shape: null, wrapped: false };
    const wrapper = WRAPPERS.find(({ open }) => this.startsWith(open));
    if (!wrapper) {
      const text = this.takeWhile(isBareName);
      return text ? { text, shape: null, wrapped: false } : null;
    }
    this.index += 1;
    const text = this.takeThrough(wrapper.close);
    return text === null ? null : { text: text.trim(), shape: wrapper.shape, wrapped: true };
  }

  /** A quoted cardinality beside an arrow, read past and left out. */
  cardinality() {
    this.skipSpace();
    if (this.take('"')) this.takeThrough('"');
    this.skipSpace();
  }

  /** An arrow such as --> or <|.. or -up->, with any bracketed style left out. */
  arrow() {
    let arrow = "";
    for (;;) {
      arrow += this.takeWhile((char) => ARROW_CHARS.includes(char));
      if (this.take("[")) this.takeThrough("]");
      else if (/^[a-z]+[-.]/.test(this.rest)) this.takeWhile((char) => /[a-z]/.test(char));
      else return arrow;
    }
  }
}

/** `From "1" --> "*" To : label` as its parts, or null when the line is not a relation. */
function relationOf(line: string) {
  const cursor = new UmlCursor(line);
  const from = cursor.name();
  cursor.cardinality();
  const arrow = cursor.arrow();
  cursor.cardinality();
  const to = cursor.name();
  cursor.skipSpace();
  const label = cursor.take(":") ? cursor.rest.trim() : "";
  const stroked = arrow.includes("-") || arrow.includes(".");
  if (!from || !to || !stroked) return null;
  // Anything left over that is not a label means the line is something else.
  return cursor.done || label ? { from, to, arrow, label } : null;
}

function labelText(text: string) {
  return stripTags(text.replaceAll("\\n", "\n")).trim();
}

/** Lines without comments, with a trailing backslash joining the next line. */
function sourceLines(text: string) {
  const lines: string[] = [];
  let comment = false;
  for (const raw of linesOf(text.replaceAll("\\\n", " "))) {
    const line = raw.trim();
    if (comment) comment = !line.endsWith("'/");
    else if (line.startsWith("/'")) comment = !line.endsWith("'/");
    else if (line && !line.startsWith("'")) lines.push(line);
  }
  return lines;
}

interface Declaration {
  id: string;
  label: string;
  shape: DiagramShape | null;
  stereotype: string;
  fill: string;
  opens: boolean;
}

/** A trailing #color on a declaration, as a canvas colour. */
function colorOf(word: string) {
  const name = word.slice(1);
  return canvasColor(/^[0-9a-f]{3,8}$/i.test(name) ? word : name);
}

/** `"Label" as alias <<stereotype>> #color {` in any of the orders PlantUML takes. */
function declaration(rest: string): Declaration | null {
  const cursor = new UmlCursor(rest);
  const first = cursor.name();
  if (!first) return null;
  const found: Declaration = {
    id: first.text,
    label: first.text,
    shape: first.shape,
    stereotype: "",
    fill: "",
    opens: rest.endsWith("{"),
  };
  cursor.skipSpace();
  if (cursor.take("as ")) {
    const second = cursor.name();
    if (!second) return null;
    // `Name as alias` and `"Label" as alias` name the alias last; `alias as "Label"` first.
    if (first.wrapped || !second.wrapped) found.id = second.text;
    else Object.assign(found, { label: second.text, shape: second.shape });
  }
  cursor.skipSpace();
  if (cursor.take("<<")) found.stereotype = (cursor.takeThrough(">>") ?? "").trim();
  cursor.skipSpace();
  if (cursor.char === "#") found.fill = colorOf(cursor.takeWhile((char) => char.trim() !== ""));
  return found;
}

type Rule = (line: string) => boolean;

/** Words that open a line this reader leaves out. */
const SKIPPED = [
  "skinparam",
  "hide",
  "show",
  "title",
  "header",
  "footer",
  "caption",
  "scale",
  "autonumber",
  "activate",
  "deactivate",
  "destroy",
  "return",
  "alt",
  "else",
  "opt",
  "loop",
  "par",
  "break",
  "critical",
  "group",
  "end",
  "box",
  "newpage",
  "legend",
  "endlegend",
  "together",
];

class Uml {
  readonly builder = new DiagramBuilder();
  private members = new Map<string, string[]>();
  /** Names an alias stands for, so either spelling reaches the same element. */
  private aliases = new Map<string, string>();
  /** The element whose braces are open, taking each line as a member. */
  private body = "";
  private note = false;
  private sequence = false;
  private messages = 0;

  private membersOf(id: string) {
    const lines = this.members.get(id) ?? [];
    this.members.set(id, lines);
    return lines;
  }

  /** The element a relation's end names, declared on first mention. */
  private element(name: Name, end: boolean) {
    if (name.text === "[*]") return this.builder.terminal(end);
    const id = this.aliases.get(name.text) ?? name.text;
    if (this.builder.has(id)) return id;
    Object.assign(this.builder.node(id), {
      label: labelText(name.text),
      shape: name.shape ?? "rectangle",
    });
    return id;
  }

  private inNote(line: string) {
    if (!this.note) return false;
    this.note = !["end note", "endnote", "endrnote", "endhnote"].includes(line.toLowerCase());
    return true;
  }

  private startsNote(line: string) {
    const opens = ["note", "rnote", "hnote"].some((word) => afterWord(line, word) !== null);
    if (opens) this.note = !line.includes(":");
    return opens;
  }

  private member(line: string) {
    if (!this.body) return false;
    if (line === "}") this.body = "";
    // Separators between a class's sections are left out.
    else if (!["--", "==", "..", "__"].some((mark) => line.startsWith(mark)))
      this.membersOf(this.body).push(line);
    return true;
  }

  private direction(line: string) {
    const lower = line.toLowerCase();
    if (lower === "left to right direction") this.builder.direction = "right";
    else if (lower === "top to bottom direction") this.builder.direction = "down";
    else return false;
    return true;
  }

  private closes(line: string) {
    if (line !== "}") return false;
    this.builder.close();
    return true;
  }

  private declare(keyword: string, found: Declaration) {
    const { id, opens } = found;
    if (found.label !== id) this.aliases.set(found.label, id);
    if (opens && !MEMBERED.has(keyword)) {
      this.builder.open(id, labelText(found.label)).fill = found.fill;
      return;
    }
    Object.assign(this.builder.node(id), {
      label: labelText(found.label),
      shape: found.shape ?? ELEMENTS[keyword],
      fill: found.fill,
    });
    const stereotype = found.stereotype || (STEREOTYPED.has(keyword) ? keyword : "");
    if (stereotype) this.membersOf(id).unshift(`«${stereotype}»`);
    if (opens) this.body = id;
  }

  /** `keyword Name …`, when the line is not a relation between two names. */
  private declared(line: string) {
    const [first, rest] = splitOnce(line.replace(/^abstract\s+/i, ""), " ");
    const keyword = first.toLowerCase();
    if (!(keyword in ELEMENTS) || rest === null || this.relation(line)) return keyword in ELEMENTS;
    const found = declaration(rest);
    if (!found) return false;
    if (SEQUENCE.has(keyword)) this.sequence = true;
    this.declare(keyword, found);
    return true;
  }

  /** A sequence diagram's messages are numbered in the order they are sent. */
  private message(label: string) {
    if (!this.sequence || !label) return label;
    this.messages += 1;
    return `${this.messages}. ${label}`;
  }

  private relation(line: string) {
    const found = relationOf(line);
    if (!found) return false;
    const { from, to, arrow } = found;
    const stroke = "-.=~";
    this.builder.edge(this.element(from, false), this.element(to, true), {
      label: labelText(this.message(found.label)),
      arrow: arrowOf(
        !stroke.includes(arrow.charAt(0)),
        !stroke.includes(arrow.charAt(arrow.length - 1))
      ),
      dashed: arrow.includes("."),
    });
    return true;
  }

  private skipped(line: string) {
    return line.startsWith("!") || SKIPPED.some((word) => afterWord(line, word) !== null);
  }

  /** `Name : member` adds a line to an element's box. */
  private described(line: string) {
    const [id, text] = splitOnce(line, ":");
    if (text === null || ![...id].every(isBareName) || !id) return false;
    const name = { text: id, shape: null, wrapped: false };
    this.membersOf(this.element(name, false)).push(text);
    return true;
  }

  /** `[Component]`, `(Use case)` or `:Actor:` on a line of its own, with an optional alias. */
  private shorthand(line: string) {
    const found = declaration(line);
    if (!found?.shape) return false;
    this.declare(found.shape === "person" ? "actor" : "component", found);
    return true;
  }

  private rules: Rule[] = [
    (line) => this.inNote(line),
    (line) => this.member(line),
    (line) => this.startsNote(line),
    (line) => this.direction(line),
    (line) => this.closes(line),
    (line) => this.declared(line),
    (line) => this.relation(line),
    (line) => this.skipped(line),
    (line) => this.described(line),
    (line) => this.shorthand(line),
  ];

  read(lines: string[]): Diagram {
    for (const line of lines) this.rules.some((rule) => rule(line));
    if (this.sequence) this.builder.direction = "right";
    for (const [id, members] of this.members) {
      const node = this.builder.nodes.get(id);
      if (node && members.length) node.label = memberLabel(node.label, members);
    }
    return this.builder.diagram();
  }
}

/** `* Root`, `** Child` lines (or + and - for the two sides) as an outline. */
function mindmap(lines: string[]): OutlineLine[] {
  const outline: OutlineLine[] = [];
  for (const line of lines) {
    const cursor = new TextCursor(line);
    const marks = cursor.takeWhile((char) => "*+-".includes(char));
    if (cursor.take("[")) cursor.takeThrough("]");
    cursor.take("_");
    const text = labelText(cursor.rest);
    if (marks && text) outline.push({ text, depth: marks.length - 1 });
  }
  return outline;
}

const STARTS = ["@startuml", "@startmindmap", "@startwbs"];

function startOf(lines: string[]) {
  return lines.findIndex((line) => STARTS.some((start) => line.toLowerCase().startsWith(start)));
}

/** Whether the text opens as PlantUML. */
export function isPlantUml(text: string) {
  return startOf(linesOf(text).map((line) => line.trim())) >= 0;
}

/** Reads PlantUML text. Throws when it holds nothing that becomes objects. */
export function parsePlantUml(text: string): Imported {
  const lines = sourceLines(text);
  const start = startOf(lines);
  const end = lines.findIndex((line) => line.toLowerCase().startsWith("@end"));
  const body = lines.slice(start + 1, end < 0 ? lines.length : end);
  const isTree = start >= 0 && !lines[start].toLowerCase().startsWith("@startuml");
  if (isTree) {
    const outline = mindmap(body);
    if (!outline.length) throw new Error("This PlantUML mind map has no topics.");
    return { kind: "tree", lines: outline };
  }
  const diagram = new Uml().read(body);
  if (!diagram.nodes.length && !diagram.groups.length)
    throw new Error(
      "This PlantUML diagram has no elements or relations to place; activity and timing diagrams stay as text."
    );
  return { kind: "diagram", diagram };
}
