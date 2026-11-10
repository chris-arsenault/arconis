import dagre from "@dagrejs/dagre";
import { footprint } from "../document/layout";
import { isBox, isLink, type Item } from "../document/types";

/** Room between layers and between nodes in a layer, in canvas units. */
const LAYER_GAP = 90;
const NODE_GAP = 40;

/**
 * A layered layout of connected objects: each becomes a node of the graph and each line among
 * them an edge, ranked left to right. Objects held by another chosen object stay with it.
 */
export function layeredLayout(items: Item[], ids: string[]) {
  const chosen = new Set(ids);
  const nodes = items.filter(
    (item) => chosen.has(item.id) && isBox(item) && !item.onLine && !chosen.has(item.inside)
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = items.filter(
    (item) =>
      isLink(item) && nodeIds.has(item.from) && nodeIds.has(item.to) && item.from !== item.to
  );
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", ranksep: LAYER_GAP, nodesep: NODE_GAP, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    const space = footprint(node);
    graph.setNode(node.id, { width: space.width, height: space.height });
  }
  for (const edge of edges) graph.setEdge(edge.from, edge.to);
  dagre.layout(graph);
  const bounds = {
    x: Math.min(...nodes.map((node) => node.x)),
    y: Math.min(...nodes.map((node) => node.y)),
  };
  const moves = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const laid = graph.node(node.id) as { x: number; y: number };
    const space = footprint(node);
    moves.set(node.id, {
      x: bounds.x + laid.x - space.width / 2 + (node.x - space.x),
      y: bounds.y + laid.y - space.height / 2,
    });
  }
  return moves;
}
