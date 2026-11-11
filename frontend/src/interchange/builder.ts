import type { OutlineLine } from "../editor/pasteAs";
import {
  newGroup,
  newNode,
  type Diagram,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  type Direction,
  type Paint,
} from "./diagram";

/** What a reader makes of a source: a diagram of boxes and lines, or an outline for a tree. */
export type Imported =
  { kind: "diagram"; diagram: Diagram } | { kind: "tree"; lines: OutlineLine[] };

/** Collects boxes, containers and lines as a source's statements name them. */
export class DiagramBuilder {
  readonly nodes = new Map<string, DiagramNode>();
  readonly groups = new Map<string, DiagramGroup>();
  readonly edges: DiagramEdge[] = [];
  /** The containers currently open, outermost first. */
  readonly scope: string[] = [];
  direction: Direction = "down";

  get parent() {
    return this.scope[this.scope.length - 1] ?? "";
  }

  has(id: string) {
    return this.nodes.has(id) || this.groups.has(id);
  }

  /** The box of this name, declared on first mention; a mention inside a container moves it in. */
  node(id: string) {
    const known = this.nodes.get(id);
    if (known) {
      if (!known.parent) known.parent = this.parent;
      return known;
    }
    const node = newNode(id, this.parent);
    this.nodes.set(id, node);
    return node;
  }

  /** Declares a container and makes it the scope of what follows, until `close`. */
  open(id: string, label: string) {
    const group = this.groups.get(id) ?? newGroup(id, label, this.parent);
    group.label = label;
    this.groups.set(id, group);
    this.scope.push(id);
    return group;
  }

  close() {
    this.scope.pop();
  }

  paint(id: string, paint: Partial<Paint>) {
    const target = this.groups.get(id) ?? this.nodes.get(id);
    if (target) Object.assign(target, paint);
  }

  /** A line between two names, each a container if one is open under that name, else a box. */
  edge(from: string, to: string, values: Pick<DiagramEdge, "label" | "arrow" | "dashed">) {
    for (const end of [from, to]) if (!this.groups.has(end)) this.node(end);
    this.edges.push({ ...values, from, to, path: "" });
  }

  /** The start or end marker of the open scope, as state diagrams draw one. */
  terminal(end: boolean) {
    const id = `${this.parent || "state"}_${end ? "end" : "start"}`;
    if (!this.nodes.has(id))
      Object.assign(this.node(id), { label: end ? "End" : "Start", shape: "ellipse" });
    return id;
  }

  diagram(): Diagram {
    // A name used for both a container and a bare mention is the container.
    const nodes = [...this.nodes.values()].filter((node) => !this.groups.has(node.id));
    const groups = [...this.groups.values()];
    return { direction: this.direction, nodes, groups, edges: this.edges, strokes: [] };
  }
}

/** A class or entity box: its name in bold over its members, one to a line. */
export function memberLabel(name: string, members: string[]) {
  return [`**${name}**`, ...members].join("\n");
}
