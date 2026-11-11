import { ARRANGEMENTS, EDGES, STENCIL_WORDS, isAttributeWord } from "../language/attributes";
import { quote } from "../language/printer";
import { DRAWING_WORDS, SIDES } from "../language/syntax";
import type {
  Box,
  Diagram,
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  DiagramStroke,
  EdgeArrow,
  Paint,
} from "./diagram";
import { layOut } from "./layout";

/** A diagram written in the canvas language: containers with what they hold, then the lines. */

/** Words that open a statement or modify one, which an id must not be. */
const STATEMENT_WORDS = new Set([
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
  "highlight",
  "arconis",
  "title",
  "scale",
  "style",
  "delete",
  "layer",
  "merge",
  "discussion",
  "comment",
  "reply",
  "resolve",
  "edit",
  "tidy",
  "none",
  "as",
  "in",
  "over",
  "shared",
  "around",
  "off",
  "default",
]);

const WORD_SETS: { has(word: string): boolean }[] = [
  STATEMENT_WORDS,
  STENCIL_WORDS,
  DRAWING_WORDS,
  ARRANGEMENTS,
  EDGES,
];

function isReserved(word: string) {
  return isAttributeWord(word) || word in SIDES || WORD_SETS.some((words) => words.has(word));
}

/** A source's name as a plain word that starts with a letter. */
function wordOf(name: string) {
  const parts = name.split(/\W+/).filter(Boolean);
  const word = parts.join("_");
  if (/^[A-Za-z]/.test(word)) return word;
  return word ? `n_${word}` : "n";
}

/** Canvas ids for a diagram's own names: plain words, unique, and never a word the language reads. */
export class IdMap {
  private byName = new Map<string, string>();
  private used = new Set<string>();

  id(name: string) {
    const known = this.byName.get(name);
    if (known) return known;
    const word = wordOf(name);
    const base = isReserved(word.toLowerCase()) ? `${word}_1` : word;
    let id = base;
    let count = 1;
    while (this.used.has(id.toLowerCase())) {
      count += 1;
      id = `${base}_${count}`;
    }
    this.used.add(id.toLowerCase());
    this.byName.set(name, id);
    return id;
  }
}

function look(paint: Paint) {
  const words: string[] = [];
  if (paint.fill) words.push(`fill ${paint.fill}`);
  if (paint.line) words.push(`line ${paint.line}`);
  if (paint.textColor) words.push(`text-color ${paint.textColor}`);
  if (paint.dashed) words.push("dashed");
  return words;
}

function placed(box: Box | null) {
  if (!box) return [];
  return [`at ${box.x},${box.y}`, `size ${Math.max(1, box.width)},${Math.max(1, box.height)}`];
}

function nodeStatement(node: DiagramNode, ids: IdMap) {
  const type = node.shape === "note" || node.shape === "text" ? node.shape : "node";
  const stencil = type === "node" && node.shape !== "rectangle" ? [node.shape] : [];
  const rotate = node.rotate ? [`rotate ${Math.round(node.rotate)}`] : [];
  const words = [type, ids.id(node.id), quote(node.label), ...stencil, ...placed(node.box)];
  return [...words, ...look(node), ...rotate].join(" ");
}

const ARROWS: Record<EdgeArrow, string> = { end: "->", start: "->", both: "<->", none: "--" };

function edgeStatement(edge: DiagramEdge, ids: IdMap) {
  // The canvas draws a line's arrow at its far end, so an arrow at the start swaps the ends.
  const ends = edge.arrow === "start" ? [edge.to, edge.from] : [edge.from, edge.to];
  const words = [ids.id(ends[0]), ARROWS[edge.arrow], ids.id(ends[1])];
  if (edge.label) words.push(quote(edge.label));
  if (edge.dashed) words.push("dashed");
  if (edge.path) words.push(`path ${edge.path}`);
  return words.join(" ");
}

function strokeStatement(stroke: DiagramStroke, id: string) {
  const points = stroke.points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ");
  const words = ["drawing", id, '""', "ink", stroke.arrow ? "arrow" : "line", "points", points];
  if (stroke.line) words.push(`line ${stroke.line}`);
  if (stroke.dashed) words.push("dashed");
  if (stroke.arrow) words.push("arrow arrow");
  return words.join(" ");
}

/** The diagram with parents and line ends that name nothing dropped. */
function sound(diagram: Diagram): Diagram {
  const known = new Set([...diagram.nodes, ...diagram.groups].map((item) => item.id));
  const parentOf = (item: DiagramNode | DiagramGroup) =>
    known.has(item.parent) && item.parent !== item.id ? item.parent : "";
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({ ...node, parent: parentOf(node) })),
    groups: diagram.groups.map((group) => ({ ...group, parent: parentOf(group) })),
    edges: diagram.edges.filter((edge) => known.has(edge.from) && known.has(edge.to)),
  };
}

/** Writes what `parent` holds, containers first, each container's contents inside its braces. */
function writeContents(
  diagram: Diagram,
  parent: string,
  indent: string,
  ids: IdMap,
  seen: Set<string>
) {
  const lines: string[] = [];
  for (const group of diagram.groups.filter((candidate) => candidate.parent === parent)) {
    // A container named as its own ancestor is written once.
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    const head = [
      "frame",
      ids.id(group.id),
      quote(group.label),
      ...placed(group.box),
      ...look(group),
    ];
    lines.push(
      `${indent}${head.join(" ")} {`,
      ...writeContents(diagram, group.id, `${indent}  `, ids, seen),
      `${indent}}`
    );
  }
  for (const node of diagram.nodes.filter((candidate) => candidate.parent === parent))
    lines.push(indent + nodeStatement(node, ids));
  return lines;
}

/** The diagram in the canvas language. */
export function diagramStatements(source: Diagram) {
  const diagram = sound(source);
  layOut(diagram);
  const ids = new IdMap();
  const lines = writeContents(diagram, "", "", ids, new Set());
  for (const edge of diagram.edges) lines.push(edgeStatement(edge, ids));
  diagram.strokes
    .filter((stroke) => stroke.points.length > 1)
    .forEach((stroke, index) => lines.push(strokeStatement(stroke, ids.id(`stroke_${index + 1}`))));
  return lines.join("\n");
}
