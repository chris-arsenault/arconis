import {
  NO_PAINT,
  canvasColor,
  type Diagram,
  type DiagramEdge,
  type DiagramShape,
  type Direction,
  type EdgeArrow,
  type Paint,
} from "./diagram";
import { TextCursor, indentOf, linesOf, unquote } from "./text";

/**
 * D2 read into the shared diagram model: keys become boxes, a key holding others becomes a
 * container, and connections become lines. Styling beyond colour and dashes is left behind.
 */

const SHAPES: Record<string, DiagramShape> = {
  rectangle: "rectangle",
  square: "rectangle",
  oval: "ellipse",
  circle: "ellipse",
  diamond: "decision",
  cylinder: "database",
  stored_data: "database",
  queue: "database",
  cloud: "cloud",
  person: "person",
  text: "text",
};

const DIRECTIONS: Record<string, Direction> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

/** Keys that configure an object rather than declare one. */
const SETTINGS = new Set([
  "shape",
  "label",
  "style",
  "direction",
  "near",
  "icon",
  "width",
  "height",
  "link",
  "tooltip",
  "class",
  "classes",
  "vars",
  "constraint",
  "top",
  "left",
  "grid-rows",
  "grid-columns",
  "grid-gap",
  "vertical-gap",
  "horizontal-gap",
  "layers",
  "scenarios",
  "steps",
  "source-arrowhead",
  "target-arrowhead",
]);

const STYLES: Record<string, keyof Paint> = {
  fill: "fill",
  stroke: "line",
  "font-color": "textColor",
};

interface D2Object extends Paint {
  path: string[];
  /** The label and shape the source gave, or null where it gave none. */
  label: string | null;
  shape: DiagramShape | null;
}

interface Entry {
  key: string;
  value: string | null;
  /** Whether the value was a block string, which D2 draws as text. */
  block: boolean;
  children: Entry[] | null;
}

const OPERATORS = ["<->", "->", "<-", "--"];
const ARROWS: Record<string, EdgeArrow> = {
  "->": "end",
  "<-": "start",
  "<->": "both",
  "--": "none",
};

/** Reads D2's nested `key: value { … }` entries. */
class Reader extends TextCursor {
  /** Skips blank space, statement separators and comments. */
  private skipBlank() {
    for (;;) {
      this.takeWhile((char) => char.trim() === "" || char === ";");
      if (this.char !== "#") return;
      this.takeWhile((char) => char !== "\n");
    }
  }

  /** A scalar up to the end of its statement, without a trailing comment. */
  private scalar(stops: string) {
    // An apostrophe in a label is text, so only double quotes shield a stop.
    const text = this.takeUntil(stops, '"');
    const comment = text.indexOf(" #");
    return (comment < 0 ? text : text.slice(0, comment)).trim();
  }

  /** `|md … |`: content between matching pipe runs, without the language tag or indentation. */
  private blockString() {
    const open = this.takeWhile((char) => char === "|" || char === "`");
    this.takeWhile((char) => char.trim() !== "");
    const content = this.takeThrough([...open].reverse().join("")) ?? this.rest;
    const lines = linesOf(content).filter((line) => line.trim());
    const indent = Math.min(...lines.map(indentOf), Number.MAX_SAFE_INTEGER);
    return lines.map((line) => line.slice(Math.min(indent, indentOf(line)))).join("\n");
  }

  private value(entry: Entry) {
    if (!this.take(":")) return;
    this.skipSpace();
    if (this.char === "|") {
      entry.value = this.blockString();
      entry.block = true;
    } else if (this.char !== "{")
      entry.value = unquote(this.scalar("{}\n;")).replaceAll("\\n", "\n");
  }

  entries(): Entry[] {
    const entries: Entry[] = [];
    for (;;) {
      this.skipBlank();
      if (this.done || this.take("}")) return entries;
      const key = this.scalar(":{}\n;");
      const entry: Entry = { key, value: null, block: false, children: null };
      this.value(entry);
      this.skipSpace();
      if (this.take("{")) entry.children = this.entries();
      if (entry.key) entries.push(entry);
    }
  }
}

/** A dotted key split into its parts, keeping dots inside quotes. */
function pathOf(key: string) {
  const parts: string[] = [];
  const cursor = new TextCursor(key);
  while (!cursor.done) {
    parts.push(unquote(cursor.takeUntil(".")));
    cursor.index += 1;
  }
  return parts.filter(Boolean);
}

/** The key with quoted text blanked, so marks inside names are not read as operators. */
function unquotedMarks(key: string) {
  let plain = "";
  const cursor = new TextCursor(key);
  while (!cursor.done) {
    plain += cursor.takeWhile((char) => char !== '"' && char !== "'");
    if (cursor.done) break;
    const quote = cursor.char;
    cursor.index += 1;
    const inner = cursor.takeThrough(quote) ?? "";
    plain += " ".repeat(inner.length + 2);
  }
  return plain;
}

/** Splits a connection chain into its ends and the operators between them. */
function chain(key: string) {
  const marks = unquotedMarks(key);
  const ends: string[] = [];
  const operators: string[] = [];
  let from = 0;
  let at = 0;
  while (at < marks.length) {
    const operator = OPERATORS.find((candidate) => marks.startsWith(candidate, at));
    if (operator) {
      ends.push(key.slice(from, at).trim());
      operators.push(operator);
      from = at + operator.length;
    }
    at += operator ? operator.length : 1;
  }
  ends.push(key.slice(from).trim());
  return { ends, operators };
}

const isDashed = (entry: Entry) => entry.key === "stroke-dash" && Number(entry.value) > 0;

/** Whether a connection's block asks for a dashed stroke, in either spelling. */
function dashedIn(children: Entry[]) {
  return children.some(
    (child) =>
      (child.key === "style.stroke-dash" && Number(child.value) > 0) ||
      (child.key === "style" && (child.children ?? []).some(isDashed))
  );
}

class D2Diagram {
  readonly objects = new Map<string, D2Object>();
  readonly edges: DiagramEdge[] = [];
  direction: Direction = "down";

  private resolve(scope: string[], key: string) {
    const path = [...scope];
    for (const part of pathOf(key)) {
      if (part === "_") path.pop();
      else path.push(part);
    }
    return path;
  }

  /** The object at a path, declaring it and every container above it on first mention. */
  private object(path: string[]) {
    for (let length = 1; length <= path.length; length += 1) {
      const prefix = path.slice(0, length);
      const id = prefix.join(".");
      if (!this.objects.has(id))
        this.objects.set(id, { ...NO_PAINT, path: prefix, label: null, shape: null });
    }
    return this.objects.get(path.join("."))!;
  }

  private style(target: D2Object, name: string, value: string) {
    if (name === "stroke-dash") target.dashed = Number(value) > 0;
    else if (name in STYLES) Object.assign(target, { [STYLES[name]]: canvasColor(value) });
  }

  private setting(owner: string[], names: string[], entry: Entry) {
    const [name, detail] = names;
    const value = entry.value ?? "";
    if (!owner.length) {
      if (name === "direction") this.direction = DIRECTIONS[value] ?? this.direction;
      return;
    }
    const target = this.object(owner);
    if (name === "style") this.styled(target, detail ?? "", entry);
    else if (name === "shape") target.shape = SHAPES[value] ?? "rectangle";
    else if (name === "label") target.label = value;
  }

  /** `style.fill: red` names one property; `style: { … }` lists several. */
  private styled(target: D2Object, detail: string, entry: Entry) {
    if (detail) this.style(target, detail, entry.value ?? "");
    else for (const child of entry.children ?? []) this.style(target, child.key, child.value ?? "");
  }

  private connection(scope: string[], entry: Entry) {
    const { ends, operators } = chain(entry.key);
    if (ends.some((end) => !end)) return;
    const paths = ends.map((end) => this.resolve(scope, end));
    paths.forEach((path) => this.object(path));
    const children = entry.children ?? [];
    const label = entry.value ?? children.find((child) => child.key === "label")?.value ?? "";
    operators.forEach((operator, index) =>
      this.edges.push({
        from: paths[index].join("."),
        to: paths[index + 1].join("."),
        label,
        arrow: ARROWS[operator],
        dashed: dashedIn(children),
        path: "",
      })
    );
  }

  private declare(scope: string[], entry: Entry) {
    const object = this.object(this.resolve(scope, entry.key));
    if (entry.value !== null) object.label = entry.value;
    if (entry.block) object.shape ??= "text";
    if (entry.children) this.read(entry.children, object.path);
  }

  read(entries: Entry[], scope: string[]) {
    for (const entry of entries) {
      // Globs and indexed connections restyle what exists and declare nothing.
      if (entry.key.startsWith("(") || entry.key.includes("*")) continue;
      const parts = pathOf(entry.key);
      const setting = parts.findIndex((part) => SETTINGS.has(part));
      if (chain(entry.key).operators.length) this.connection(scope, entry);
      else if (setting < 0) this.declare(scope, entry);
      else this.setting([...scope, ...parts.slice(0, setting)], parts.slice(setting), entry);
    }
  }

  diagram(): Diagram {
    const ids = [...this.objects.keys()];
    const diagram: Diagram = {
      direction: this.direction,
      nodes: [],
      groups: [],
      edges: this.edges,
      strokes: [],
    };
    for (const [id, object] of this.objects) {
      const { fill, line, textColor, dashed, path } = object;
      const label = object.label ?? path[path.length - 1];
      const parent = path.slice(0, -1).join(".");
      const common = { id, label, parent, box: null, fill, line, textColor, dashed };
      if (ids.some((other) => other.startsWith(`${id}.`))) diagram.groups.push(common);
      else diagram.nodes.push({ ...common, shape: object.shape ?? "rectangle", rotate: 0 });
    }
    return diagram;
  }
}

/** Reads D2 text. Throws when it declares nothing. */
export function parseD2(text: string): Diagram {
  const reading = new D2Diagram();
  reading.read(new Reader(text.replaceAll("\r\n", "\n")).entries(), []);
  const diagram = reading.diagram();
  if (!diagram.nodes.length && !diagram.groups.length)
    throw new Error("This D2 text has nothing in it to place.");
  return diagram;
}

const NAME_WORDS = 4;

/** Whether a line is shaped like a D2 statement: short names, no sentence punctuation. */
function isStatement(line: string) {
  if (line === "}") return true;
  if (line.includes(", ") || ".?!".includes(line.charAt(line.length - 1))) return false;
  const head = line.split(":")[0].trim();
  if (head.includes("{") && !head.endsWith("{")) return false;
  return chain(head.replace("{", "")).ends.every((name) => {
    const words = name.split(" ").filter(Boolean);
    return words.length > 0 && words.length <= NAME_WORDS;
  });
}

/**
 * Whether pasted text reads as D2. D2 has no opening line of its own, so every line must be a
 * connection, a key or a closing brace, and at least one connection must carry an arrow.
 */
export function looksLikeD2(text: string) {
  const lines = linesOf(text)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const arrowed = (line: string) =>
    chain(line.split(":")[0]).operators.some((operator) => operator !== "--");
  return lines.length > 1 && lines.every(isStatement) && lines.some(arrowed);
}
