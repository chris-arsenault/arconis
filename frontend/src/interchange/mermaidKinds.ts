import type { OutlineLine } from "../editor/pasteAs";
import { DiagramBuilder, memberLabel } from "./builder";
import { arrowOf, type Diagram, type Direction } from "./diagram";
import { mermaidLabel } from "./mermaidFlow";
import { TextCursor, afterWord, indentOf, splitOnce, unquote } from "./text";

/** Mermaid's state, class and entity diagrams as boxes and lines, and its mind map as an outline. */

export const MERMAID_DIRECTIONS: Record<string, Direction> = {
  TB: "down",
  TD: "down",
  BT: "up",
  LR: "right",
  RL: "left",
};

type Rule = (line: string) => boolean;

/** Hands each non-blank line to the first rule that recognises it. */
function readLines(lines: string[], rules: Rule[]) {
  for (const raw of lines) {
    const line = raw.trim();
    if (line) rules.some((rule) => rule(line));
  }
}

function direction(builder: DiagramBuilder): Rule {
  return (line) => {
    const rest = afterWord(line, "direction");
    if (rest === null) return false;
    builder.direction = MERMAID_DIRECTIONS[rest] ?? builder.direction;
    return true;
  };
}

function closing(builder: DiagramBuilder): Rule {
  return (line) => {
    if (line !== "}") return false;
    builder.close();
    return true;
  };
}

/** Notes are left out: a one-line note ends at its colon's text, a block at `end note`. */
function notes(): Rule {
  let open = false;
  return (line) => {
    if (open) {
      open = line.toLowerCase() !== "end note";
      return true;
    }
    if (afterWord(line, "note") === null) return false;
    open = !line.includes(":");
    return true;
  };
}

const isWord = (text: string) => /^[\w-]+$/.test(text);

/** `state "Description" as id {`, in the parts it has. */
function stateDeclaration(rest: string) {
  const opens = rest.endsWith("{");
  const [head] = splitOnce(opens ? rest.slice(0, -1) : rest, "<<");
  const [described, id] = splitOnce(head, " as ");
  if (id === null) return { id: head, label: head, opens };
  return { id, label: unquote(described), opens };
}

export function mermaidStates(lines: string[]): Diagram {
  const builder = new DiagramBuilder();
  const state = (name: string, end: boolean) => (name === "[*]" ? builder.terminal(end) : name);
  const declared: Rule = (line) => {
    const rest = afterWord(line, "state");
    if (rest === null) return false;
    const { id, label, opens } = stateDeclaration(rest);
    if (opens) builder.open(id, label);
    else builder.node(id).label = label;
    return true;
  };
  const transition: Rule = (line) => {
    const [from, rest] = splitOnce(line, "-->");
    if (rest === null) return false;
    const [to, label] = splitOnce(rest, ":");
    builder.edge(state(from, false), state(to, true), {
      label: mermaidLabel(label ?? ""),
      arrow: "end",
      dashed: false,
    });
    return true;
  };
  const described: Rule = (line) => {
    const [id, text] = splitOnce(line, ":");
    if (text === null || !isWord(id) || builder.groups.has(id)) return false;
    builder.node(id).label = mermaidLabel(text);
    return true;
  };
  readLines(lines, [
    notes(),
    direction(builder),
    closing(builder),
    declared,
    transition,
    described,
  ]);
  return builder.diagram();
}

const RELATION_MARKS = "<|*o.>-";
const isClassName = (char: string) => /^[\w~]$/.test(char);

interface Relation {
  left: string;
  right: string;
  mark: string;
  label: string;
}

/** `Left "1" <|-- "*" Right : label`, or null when the line is not a relation. */
function classRelation(line: string): Relation | null {
  const cursor = new TextCursor(line);
  const quoted = () => {
    cursor.skipSpace();
    if (cursor.take('"')) cursor.takeThrough('"');
    cursor.skipSpace();
  };
  const left = cursor.takeWhile(isClassName);
  quoted();
  const mark = cursor.takeWhile((char) => RELATION_MARKS.includes(char));
  quoted();
  const right = cursor.takeWhile(isClassName);
  cursor.skipSpace();
  const label = cursor.take(":") ? cursor.rest : "";
  const joined = mark.includes("--") || mark.includes("..");
  if (!left || !right || !joined || (!cursor.done && !label)) return null;
  return { left, right, mark, label };
}

/** A class's name without its generic part. */
const className = (name: string) => splitOnce(name, "~")[0];

class ClassReader {
  readonly builder = new DiagramBuilder();
  private members = new Map<string, string[]>();
  private titles = new Map<string, string>();
  /** The class whose braces are open, taking each line as a member. */
  private body = "";

  private known(name: string) {
    const id = className(name);
    this.builder.node(id);
    if (!this.members.has(id)) this.members.set(id, []);
    return id;
  }

  private annotate(id: string, annotation: string) {
    this.members.get(this.known(id))!.unshift(`«${annotation}»`);
  }

  private member(line: string) {
    if (!this.body) return false;
    if (line === "}") this.body = "";
    else if (line.startsWith("<<")) this.annotate(this.body, line.slice(2, -2));
    else this.members.get(this.body)!.push(line);
    return true;
  }

  private namespace(line: string) {
    const rest = afterWord(line, "namespace");
    if (rest === null) return false;
    const name = splitOnce(rest, "{")[0];
    this.builder.open(name, name);
    return true;
  }

  /** `class Name["Title"] <<annotation>> {`. */
  private declared(line: string) {
    const rest = afterWord(line, "class");
    if (rest === null) return false;
    const cursor = new TextCursor(rest);
    const id = this.known(cursor.takeWhile(isClassName));
    if (cursor.take('["')) this.titles.set(id, cursor.takeThrough('"]') ?? id);
    cursor.skipSpace();
    if (cursor.take("<<")) this.annotate(id, cursor.takeThrough(">>") ?? "");
    cursor.skipSpace();
    if (cursor.take("{") && !cursor.rest.includes("}")) this.body = id;
    return true;
  }

  /** `<<interface>> Name` on a line of its own. */
  private annotated(line: string) {
    if (!line.startsWith("<<")) return false;
    const [annotation, name] = splitOnce(line.slice(2), ">>");
    if (name) this.annotate(name, annotation);
    return true;
  }

  private relation(line: string) {
    const relation = classRelation(line);
    if (!relation) return false;
    const { mark } = relation;
    const start = "<*o".includes(mark.charAt(0));
    const end = ">*o".includes(mark.charAt(mark.length - 1));
    this.builder.edge(this.known(relation.left), this.known(relation.right), {
      label: mermaidLabel(relation.label),
      arrow: arrowOf(start, end),
      dashed: mark.includes(".."),
    });
    return true;
  }

  private described(line: string) {
    const [id, text] = splitOnce(line, ":");
    if (text === null || ![...id].every(isClassName)) return false;
    this.members.get(this.known(id))!.push(text);
    return true;
  }

  read(lines: string[]) {
    readLines(lines, [
      (line) => this.member(line),
      notes(),
      direction(this.builder),
      (line) => this.namespace(line),
      closing(this.builder),
      (line) => this.declared(line),
      (line) => this.annotated(line),
      (line) => this.relation(line),
      (line) => this.described(line),
    ]);
    for (const [id, members] of this.members)
      this.builder.node(id).label = memberLabel(this.titles.get(id) ?? id, members);
    return this.builder.diagram();
  }
}

export function mermaidClasses(lines: string[]): Diagram {
  return new ClassReader().read(lines);
}

export function mermaidEntities(lines: string[]): Diagram {
  const builder = new DiagramBuilder();
  builder.direction = "right";
  const fields = new Map<string, string[]>();
  let body = "";
  const entity = (name: string) => {
    const id = unquote(name);
    builder.node(id);
    if (!fields.has(id)) fields.set(id, []);
    return id;
  };
  const field: Rule = (line) => {
    if (!body) return false;
    if (line === "}") body = "";
    // A field's trailing quoted comment is left out.
    else fields.get(body)!.push(splitOnce(line, ' "')[0]);
    return true;
  };
  const relation: Rule = (line) => {
    const [head, label] = splitOnce(line, ":");
    const words = head.split(/\s+/);
    const joined = words.length === 3 && (words[1].includes("--") || words[1].includes(".."));
    if (!joined) return false;
    builder.edge(entity(words[0]), entity(words[2]), {
      label: mermaidLabel(label ?? ""),
      arrow: "none",
      dashed: words[1].includes(".."),
    });
    return true;
  };
  const declared: Rule = (line) => {
    const opens = line.endsWith("{");
    const name = opens ? line.slice(0, -1).trim() : line;
    if (!isWord(unquote(name))) return false;
    const id = entity(name);
    if (opens) body = id;
    return true;
  };
  readLines(lines, [field, direction(builder), relation, declared]);
  for (const [id, lines_] of fields) builder.node(id).label = memberLabel(id, lines_);
  return builder.diagram();
}

const BRACKET_CHARS = "[](){}";

/** A mind map topic's text, without the id and brackets that only shape it. */
function topicText(text: string) {
  const at = [...text].findIndex((char) => BRACKET_CHARS.includes(char));
  if (at < 0 || !/^[\w-]*$/.test(text.slice(0, at))) return mermaidLabel(text);
  const cursor = new TextCursor(text.slice(at));
  cursor.takeWhile((char) => BRACKET_CHARS.includes(char));
  let inner = cursor.rest;
  while (inner && BRACKET_CHARS.includes(inner.charAt(inner.length - 1)))
    inner = inner.slice(0, -1);
  return mermaidLabel(inner);
}

/** A mind map's lines as an outline, nested by how far each is indented. */
export function mermaidMindmap(lines: string[]): OutlineLine[] {
  const outline: OutlineLine[] = [];
  const indents: number[] = [];
  for (const raw of lines) {
    const text = raw.trim();
    if (!text || text.startsWith("::")) continue;
    const indent = indentOf(raw);
    while (indents.length && indents[indents.length - 1] >= indent) indents.pop();
    indents.push(indent);
    outline.push({ text: topicText(text), depth: indents.length - 1 });
  }
  return outline;
}
