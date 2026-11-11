import dagre from "@dagrejs/dagre";
import type { Box, Diagram, DiagramGroup, DiagramNode, DiagramShape, Direction } from "./diagram";

/** Positions for a diagram whose source gave none: boxes ranked along the lines between them. */

/** Room between ranks and between neighbours in a rank, in canvas units. */
const RANK_GAP = 80;
const NODE_GAP = 40;
/** An imported box is sized to its text within these bounds. */
const MIN_WIDTH = 120;
const MAX_WIDTH = 300;
const MIN_HEIGHT = 60;
const CHARACTER_WIDTH = 8;
const LINE_HEIGHT = 22;
const TEXT_MARGIN = 40;
const EMPTY_GROUP = { width: 220, height: 140 };
const LABEL_WIDTH = 200;
/** Room a container keeps around what it holds, and above it for its title. */
const GROUP_PADDING = 24;
const GROUP_TITLE = 32;

/** Shapes whose outline cuts into their bounds take more room for the same text. */
const GROWTH: Partial<Record<DiagramShape, number>> = { decision: 1.4, ellipse: 1.15 };

const RANK_DIRECTIONS: Record<Direction, string> = {
  right: "LR",
  down: "TB",
  left: "RL",
  up: "BT",
};

/** The size a box takes for its text. */
export function sizeFor(label: string, shape: DiagramShape) {
  const lines = label.split("\n");
  const longest = Math.max(0, ...lines.map((line) => line.length));
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest * CHARACTER_WIDTH + TEXT_MARGIN));
  const perRow = (width - TEXT_MARGIN) / CHARACTER_WIDTH;
  const rows = lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / perRow)),
    0
  );
  const height = Math.max(MIN_HEIGHT, rows * LINE_HEIGHT + 28);
  const grow = GROWTH[shape] ?? 1;
  return { width: Math.round(width * grow), height: Math.round(height * grow) };
}

function holds(diagram: Diagram, id: string) {
  return (
    diagram.nodes.some((node) => node.parent === id) ||
    diagram.groups.some((group) => group.parent === id)
  );
}

/** A leaf box standing in for a container when ranking a line that ends on the container. */
function leafOf(diagram: Diagram, id: string): string {
  const child =
    diagram.nodes.find((node) => node.parent === id) ??
    diagram.groups.find((group) => group.parent === id);
  return child ? leafOf(diagram, child.id) : id;
}

function rankedGraph(diagram: Diagram) {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  graph.setGraph({
    rankdir: RANK_DIRECTIONS[diagram.direction],
    ranksep: RANK_GAP,
    nodesep: NODE_GAP,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const group of diagram.groups)
    graph.setNode(group.id, holds(diagram, group.id) ? {} : EMPTY_GROUP);
  for (const node of diagram.nodes) graph.setNode(node.id, sizeFor(node.label, node.shape));
  for (const item of [...diagram.groups, ...diagram.nodes])
    if (item.parent) graph.setParent(item.id, item.parent);
  diagram.edges.forEach((edge, index) => {
    const from = leafOf(diagram, edge.from);
    const to = leafOf(diagram, edge.to);
    if (from === to) return;
    const width = Math.min(LABEL_WIDTH, edge.label.length * CHARACTER_WIDTH);
    graph.setEdge(
      from,
      to,
      { width, height: edge.label ? LINE_HEIGHT : 0, labelpos: "c" },
      `e${index}`
    );
  });
  return graph;
}

/** Whether the source already placed everything. */
function isPlaced(diagram: Diagram) {
  return [...diagram.nodes, ...diagram.groups].every((item) => item.box !== null);
}

/**
 * Sizes a container around what it holds, with room for its title, working inward first. A
 * container named as its own ancestor is left for the canvas to place.
 */
function fitGroup(diagram: Diagram, group: DiagramGroup, visiting: Set<string>): Box | null {
  if (group.box || visiting.has(group.id)) return group.box;
  visiting.add(group.id);
  const inner = [
    ...diagram.nodes.filter((node) => node.parent === group.id).map((node) => node.box),
    ...diagram.groups
      .filter((child) => child.parent === group.id)
      .map((child) => fitGroup(diagram, child, visiting)),
  ].filter((box) => box !== null);
  if (!inner.length) return null;
  const left = Math.min(...inner.map((box) => box.x));
  const top = Math.min(...inner.map((box) => box.y));
  const right = Math.max(...inner.map((box) => box.x + box.width));
  const bottom = Math.max(...inner.map((box) => box.y + box.height));
  group.box = {
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING - GROUP_TITLE,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2 + GROUP_TITLE,
  };
  return group.box;
}

/** Gives every box without a position one. A container left unplaced fits what it holds. */
export function layOut(diagram: Diagram) {
  if (isPlaced(diagram)) return;
  const graph = rankedGraph(diagram);
  dagre.layout(graph);
  const place = (item: DiagramNode | DiagramGroup) => {
    const laid = graph.node(item.id) as Box;
    item.box = {
      x: Math.round(laid.x - laid.width / 2),
      y: Math.round(laid.y - laid.height / 2),
      width: Math.round(laid.width),
      height: Math.round(laid.height),
    };
  };
  diagram.nodes.forEach(place);
  diagram.groups.filter((group) => !holds(diagram, group.id)).forEach(place);
  const visiting = new Set<string>();
  for (const group of diagram.groups) fitGroup(diagram, group, visiting);
}
