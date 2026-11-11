import type { Imported } from "./builder";
import type { Diagram } from "./diagram";
import { mermaidFlowchart } from "./mermaidFlow";
import {
  MERMAID_DIRECTIONS,
  mermaidClasses,
  mermaidEntities,
  mermaidMindmap,
  mermaidStates,
} from "./mermaidKinds";
import { linesOf, splitOnce } from "./text";

/**
 * Mermaid's box-and-line diagrams and its mind map. Each kind keeps its own statement grammar;
 * all of them end as boxes, containers and lines, or as an outline.
 */

type Kind = "flowchart" | "state" | "class" | "entity" | "mindmap";

const KINDS: Record<string, Kind> = {
  graph: "flowchart",
  flowchart: "flowchart",
  stateDiagram: "state",
  "stateDiagram-v2": "state",
  classDiagram: "class",
  "classDiagram-v2": "class",
  erDiagram: "entity",
  mindmap: "mindmap",
};

const READERS: Record<Exclude<Kind, "flowchart" | "mindmap">, (lines: string[]) => Diagram> = {
  state: mermaidStates,
  class: mermaidClasses,
  entity: mermaidEntities,
};

/** The diagram's lines without fences, front matter, directives or comments. */
function sourceLines(text: string) {
  const lines = linesOf(text);
  // Front matter is a leading block between two --- lines.
  const closes =
    lines[0]?.trim() === "---"
      ? lines.findIndex((line, at) => at > 0 && line.trim() === "---")
      : -1;
  return lines
    .slice(closes + 1)
    .filter((line) => !line.trim().startsWith("```") && !line.trim().startsWith("%%"))
    .map((line) => (line.includes(" %%") ? line.slice(0, line.indexOf(" %%")) : line));
}

/** The opening line's kind and the rest of that line, with the lines that follow. */
function opening(text: string) {
  const lines = sourceLines(text);
  const start = lines.findIndex((line) => line.trim());
  if (start < 0) return null;
  const first = lines[start].trim();
  const word = first.split(/[\s;]/)[0];
  if (!(word in KINDS)) return null;
  return { kind: KINDS[word], rest: first.slice(word.length).trim(), body: lines.slice(start + 1) };
}

/** Whether the text opens as a Mermaid diagram this reader turns into objects. */
export function isMermaid(text: string) {
  return opening(text) !== null;
}

function flowchart(rest: string, body: string[]) {
  // The direction follows the kind, and statements may share that line after a semicolon.
  const [heading, sameLine] = splitOnce(rest, ";");
  const diagram = mermaidFlowchart(sameLine === null ? body : [sameLine, ...body]);
  return { ...diagram, direction: MERMAID_DIRECTIONS[heading] ?? "down" };
}

/** Reads a Mermaid diagram. Throws when the text is not a kind that becomes objects. */
export function parseMermaid(text: string): Imported {
  const opened = opening(text);
  if (!opened)
    throw new Error(
      "Only Mermaid flowcharts, state, class and entity diagrams and mind maps become objects."
    );
  const { kind, rest, body } = opened;
  if (kind === "mindmap") return { kind: "tree", lines: mermaidMindmap(body) };
  const diagram = kind === "flowchart" ? flowchart(rest, body) : READERS[kind](body);
  if (!diagram.nodes.length && !diagram.groups.length)
    throw new Error("This Mermaid diagram has nothing in it to place.");
  return { kind: "diagram", diagram };
}
