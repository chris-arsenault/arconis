/**
 * What every foreign diagram reduces to before it is written in the canvas language: boxes, the
 * containers that hold them and the lines between them. A format that carries positions keeps
 * them; one that does not is laid out in ranks.
 */

export type DiagramShape =
  | "rectangle"
  | "ellipse"
  | "decision"
  | "service"
  | "database"
  | "cloud"
  | "person"
  | "note"
  | "text";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Colours a source gave; an empty colour leaves the canvas's own. */
export interface Paint {
  fill: string;
  line: string;
  textColor: string;
  dashed: boolean;
}

export const NO_PAINT: Paint = { fill: "", line: "", textColor: "", dashed: false };

export interface DiagramNode extends Paint {
  id: string;
  label: string;
  shape: DiagramShape;
  /** The container holding it, or "" at the top level. */
  parent: string;
  /** Where the source put it, or null for the layout to decide. */
  box: Box | null;
  rotate: number;
}

export interface DiagramGroup extends Paint {
  id: string;
  label: string;
  parent: string;
  box: Box | null;
}

export type EdgeArrow = "end" | "start" | "both" | "none";
export type EdgePath = "" | "cornered" | "diagonal" | "curved";

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  arrow: EdgeArrow;
  dashed: boolean;
  /** The line's type, or "" for the canvas's default. */
  path: EdgePath;
}

/** A line that joins nothing, kept as an editable path through its points. */
export interface DiagramStroke {
  points: [number, number][];
  arrow: boolean;
  line: string;
  dashed: boolean;
}

export type Direction = "right" | "down" | "left" | "up";

export interface Diagram {
  direction: Direction;
  nodes: DiagramNode[];
  groups: DiagramGroup[];
  edges: DiagramEdge[];
  strokes: DiagramStroke[];
}

/** A box as a source first names it: its own name as its label, plain, unplaced. */
export function newNode(id: string, parent: string): DiagramNode {
  return { ...NO_PAINT, id, label: id, shape: "rectangle", parent, box: null, rotate: 0 };
}

export function newGroup(id: string, label: string, parent: string): DiagramGroup {
  return { ...NO_PAINT, id, label, parent, box: null };
}

/** Which ends carry an arrowhead. */
export function arrowOf(start: boolean, end: boolean): EdgeArrow {
  if (start && end) return "both";
  if (end) return "end";
  return start ? "start" : "none";
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  lightyellow: "#ffffe0",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  brown: "#a52a2a",
  navy: "#000080",
  teal: "#008080",
  silver: "#c0c0c0",
  gold: "#ffd700",
  salmon: "#fa8072",
  tomato: "#ff6347",
  skyblue: "#87ceeb",
  steelblue: "#4682b4",
  aliceblue: "#f0f8ff",
  honeydew: "#f0fff0",
  lavender: "#e6e6fa",
};

/** A colour as the canvas writes it, #rrggbb, or "" when the value is not one it knows. */
export function canvasColor(value: string) {
  const text = value.trim().replaceAll('"', "").replaceAll("'", "").toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{8}$/.test(text)) return text.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/.test(text))
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return NAMED_COLORS[text] ?? "";
}
