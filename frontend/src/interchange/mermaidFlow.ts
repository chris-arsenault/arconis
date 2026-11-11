import { DiagramBuilder } from "./builder";
import {
  arrowOf,
  canvasColor,
  type Diagram,
  type DiagramEdge,
  type DiagramShape,
  type Paint,
} from "./diagram";
import { TextCursor, afterWord, isNameChar, splitOnce, stripTags, unquote } from "./text";

/** Mermaid's flowchart: nodes shaped by their brackets, lines by their strokes, and subgraphs. */

const BREAKS = ["<br>", "<br/>", "<br />", "<BR>", "<BR/>"];

/** A label as the canvas shows it: quotes and Markdown-string ticks off, HTML breaks as lines. */
export function mermaidLabel(raw: string) {
  let text = unquote(unquote(raw));
  for (const mark of BREAKS) text = text.replaceAll(mark, "\n");
  return stripTags(text).replaceAll("#quot;", '"').replaceAll("#amp;", "&").trim();
}

const PAINT_KEYS: Record<string, keyof Paint> = {
  fill: "fill",
  stroke: "line",
  color: "textColor",
};

/** Mermaid's fill, stroke and color declarations as canvas paint. */
export function mermaidPaint(css: string) {
  const paint: Partial<Paint> = {};
  for (const part of css.split(",")) {
    const [key, value] = splitOnce(part, ":");
    const color = canvasColor(value ?? "");
    if (key === "stroke-dasharray") paint.dashed = true;
    else if (key in PAINT_KEYS && color) Object.assign(paint, { [PAINT_KEYS[key]]: color });
  }
  return paint;
}

/** Bracket pairs that give a node its shape, longest opener first. */
const BRACKETS: { open: string; close: string[]; shape: DiagramShape }[] = [
  { open: "(((", close: [")))"], shape: "ellipse" },
  { open: "([", close: ["])"], shape: "ellipse" },
  { open: "[[", close: ["]]"], shape: "rectangle" },
  { open: "[(", close: [")]"], shape: "database" },
  { open: "((", close: ["))"], shape: "ellipse" },
  { open: "{{", close: ["}}"], shape: "rectangle" },
  { open: "[/", close: ["/]", "\\]"], shape: "rectangle" },
  { open: "[\\", close: ["\\]", "/]"], shape: "rectangle" },
  { open: ">", close: ["]"], shape: "rectangle" },
  { open: "(", close: [")"], shape: "rectangle" },
  { open: "[", close: ["]"], shape: "rectangle" },
  { open: "{", close: ["}"], shape: "decision" },
];

/** Shapes named in the `id@{ shape: … }` form. */
const SHAPE_NAMES: Record<string, DiagramShape> = {
  stadium: "ellipse",
  circle: "ellipse",
  "sm-circ": "ellipse",
  "dbl-circ": "ellipse",
  diam: "decision",
  diamond: "decision",
  decision: "decision",
  cyl: "database",
  cylinder: "database",
  database: "database",
  cloud: "cloud",
  text: "text",
};

interface NodeRef {
  id: string;
  /** The label and shape its brackets gave, or null where the mention gave none. */
  label: string | null;
  shape: DiagramShape | null;
  className: string;
}

type Stroke = Pick<DiagramEdge, "label" | "arrow" | "dashed">;

const HEADS = ">xo";

/** Reads one statement's nodes and the lines between them. */
class FlowScanner extends TextCursor {
  /** A name: word characters, with a single dash or dot allowed between them. */
  private name() {
    let name = this.takeWhile(isNameChar);
    while (name && "-.".includes(this.char) && isNameChar(this.source.charAt(this.index + 1))) {
      name += this.char;
      this.index += 1;
      name += this.takeWhile(isNameChar);
    }
    return name;
  }

  /** The text inside a bracket pair, up to the first closer that follows any quoted part. */
  private bracketed(closers: string[]) {
    const from =
      this.char === '"'
        ? Math.max(this.index, this.source.indexOf('"', this.index + 1))
        : this.index;
    const ends = closers
      .map((closer) => ({ closer, at: this.source.indexOf(closer, from) }))
      .filter((end) => end.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (!ends.length) return null;
    const text = this.source.slice(this.index, ends[0].at);
    this.index = ends[0].at + ends[0].closer.length;
    return text;
  }

  private shaped(ref: NodeRef) {
    const bracket = BRACKETS.find(({ open }) => this.startsWith(open));
    if (!bracket) return;
    const before = this.index;
    this.index += bracket.open.length;
    const text = this.bracketed(bracket.close);
    if (text === null) this.index = before;
    else Object.assign(ref, { label: mermaidLabel(text), shape: bracket.shape });
  }

  /** `id@{ shape: cyl, label: "Orders" }`. */
  private described(ref: NodeRef) {
    if (!this.take("@{")) return;
    const body = this.takeThrough("}") ?? "";
    for (const part of body.split(",")) {
      const [key, value] = splitOnce(part, ":");
      if (key === "label") ref.label = mermaidLabel(value ?? "");
      if (key === "shape") ref.shape = SHAPE_NAMES[value ?? ""] ?? "rectangle";
    }
  }

  private node(): NodeRef | null {
    this.skipSpace();
    const id = this.name();
    if (!id) return null;
    const ref: NodeRef = { id, label: null, shape: null, className: "" };
    this.shaped(ref);
    this.described(ref);
    if (this.take(":::"))
      ref.className = this.takeWhile((char) => isNameChar(char) || char === "-");
    return ref;
  }

  /** One node, or several joined by &. */
  nodes() {
    const found: NodeRef[] = [];
    for (;;) {
      const node = this.node();
      if (!node) return found;
      found.push(node);
      this.skipSpace();
      if (!this.take("&")) return found;
    }
  }

  private head() {
    if (!HEADS.includes(this.char) || this.done) return false;
    const next = this.source.charAt(this.index + 1);
    if (this.char !== ">" && next.trim() !== "") return false;
    this.index += 1;
    return true;
  }

  /** `-- text -->`: the text between an opening stroke and the stroke that closes it. */
  private inlineLabel(mark: string, closer: string) {
    const text = this.takeThrough(closer);
    if (text === null) return "";
    this.takeWhile((char) => char === mark);
    return mermaidLabel(text);
  }

  private dotted(): Pick<Stroke, "label" | "dashed"> {
    this.index += 1;
    this.takeWhile((char) => char === ".");
    if (this.char !== "-") return { label: this.inlineLabel("-", ".-"), dashed: true };
    this.takeWhile((char) => char === "-");
    return { label: "", dashed: true };
  }

  private solid(mark: string): Pick<Stroke, "label" | "dashed"> {
    const stroke = this.takeWhile((char) => char === mark);
    const plain = stroke.length > 2 || HEADS.includes(this.char) || this.char === "|" || this.done;
    return { label: plain ? "" : this.inlineLabel(mark, mark + mark), dashed: false };
  }

  /** A line between two node groups, with its label; null when none starts here. */
  edge(): Stroke | null {
    this.skipSpace();
    const lead = this.char;
    const marked = "<xo".includes(lead) && "-=".includes(this.source.charAt(this.index + 1));
    if (marked && !this.done) this.index += 1;
    let stroke: Pick<Stroke, "label" | "dashed">;
    if (this.startsWith("-.")) stroke = this.dotted();
    else if (this.startsWith("--")) stroke = this.solid("-");
    else if (this.startsWith("==")) stroke = this.solid("=");
    else return null;
    const arrow = arrowOf(marked, this.head());
    this.skipSpace();
    const piped = this.take("|") ? mermaidLabel(this.takeThrough("|") ?? "") : "";
    return { ...stroke, label: stroke.label || piped, arrow };
  }
}

/** Splits a line on semicolons that sit outside quotes and brackets. */
function statements(line: string) {
  const parts: string[] = [];
  const cursor = new TextCursor(line);
  let depth = 0;
  let part = "";
  while (!cursor.done) {
    part += cursor.takeUntil(";[({])}");
    if (cursor.done) break;
    const char = cursor.char;
    cursor.index += 1;
    if ("[({".includes(char)) depth += 1;
    if ("])}".includes(char)) depth = Math.max(0, depth - 1);
    if (char === ";" && depth === 0) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  parts.push(part);
  return parts.map((text) => text.trim()).filter(Boolean);
}

const IGNORED = ["direction", "linkStyle", "click", "accTitle", "accDescr"];

class Flowchart {
  readonly builder = new DiagramBuilder();
  private classes = new Map<string, Partial<Paint>>();
  private classed: [string, string][] = [];
  private anonymous = 0;

  private subgraph(statement: string) {
    const rest = afterWord(statement, "subgraph");
    if (rest === null) return false;
    const [id, title] = splitOnce(rest, "[");
    if (title !== null && /^[\w-]+$/.test(id))
      this.builder.open(id, mermaidLabel(title.slice(0, -1)));
    else if (/^[\w-]+$/.test(rest)) this.builder.open(rest, rest);
    else {
      this.anonymous += 1;
      this.builder.open(`subgraph_${this.anonymous}`, mermaidLabel(rest));
    }
    return true;
  }

  private end(statement: string) {
    if (statement !== "end") return false;
    this.builder.close();
    return true;
  }

  private style(statement: string) {
    const rest = afterWord(statement, "style");
    if (rest === null) return false;
    const [ids, css] = splitOnce(rest, " ");
    ids.split(",").forEach((id) => this.builder.paint(id, mermaidPaint(css ?? "")));
    return true;
  }

  private classDef(statement: string) {
    const rest = afterWord(statement, "classDef");
    if (rest === null) return false;
    const [names, css] = splitOnce(rest, " ");
    names.split(",").forEach((name) => this.classes.set(name, mermaidPaint(css ?? "")));
    return true;
  }

  private classAssign(statement: string) {
    const rest = afterWord(statement, "class");
    if (rest === null) return false;
    const [ids, name] = splitOnce(rest, " ");
    ids.split(",").forEach((id) => this.classed.push([id, name ?? ""]));
    return true;
  }

  private ignored(statement: string) {
    return IGNORED.some((word) => afterWord(statement, word) !== null);
  }

  private declare(refs: NodeRef[]) {
    for (const ref of refs) {
      if (ref.className) this.classed.push([ref.id, ref.className]);
      if (this.builder.groups.has(ref.id)) continue;
      const node = this.builder.node(ref.id);
      if (ref.label !== null) node.label = ref.label;
      if (ref.shape !== null) node.shape = ref.shape;
    }
  }

  private links(statement: string) {
    const scanner = new FlowScanner(statement);
    let from = scanner.nodes();
    this.declare(from);
    while (from.length) {
      const stroke = scanner.edge();
      if (!stroke) break;
      const to = scanner.nodes();
      this.declare(to);
      for (const start of from) for (const end of to) this.builder.edge(start.id, end.id, stroke);
      from = to;
    }
    return true;
  }

  /** The first rule that recognises a statement handles it. */
  private rules: ((statement: string) => boolean)[] = [
    (statement) => this.subgraph(statement),
    (statement) => this.end(statement),
    (statement) => this.style(statement),
    (statement) => this.classDef(statement),
    (statement) => this.classAssign(statement),
    (statement) => this.ignored(statement),
    (statement) => this.links(statement),
  ];

  read(lines: string[]) {
    for (const statement of lines.flatMap(statements)) this.rules.some((rule) => rule(statement));
    for (const [id, name] of this.classed) this.builder.paint(id, this.classes.get(name) ?? {});
    return this.builder.diagram();
  }
}

/** Reads a flowchart's statements, the lines after its opening one. */
export function mermaidFlowchart(lines: string[]): Diagram {
  return new Flowchart().read(lines);
}
