import type { CanvasDocument } from "../document/canvasDocument";
import type { CanvasObject } from "../document/types";
import { CanvasIndex, DomainError } from "./canvasIndex";
import type { Arrow, Look, Route } from "./look";
import { projectCanvas, type Point, type Stencil } from "./model";
import type { Edge, Placement } from "./placement";

export type Size = { width: number; height: number };

/** A change in domain terms. Items are referred to by id, by a unique name, or by a batch handle. */
export type Operation =
  | {
      op: "add";
      type: "node" | "region" | "text";
      name?: string;
      stencil?: Stencil;
      icon?: string;
      frame?: "panel" | "group";
      note?: boolean;
      at?: Placement;
      size?: Size;
      inside?: string;
      look?: Look;
      /** A handle later operations in the batch can use for this item. */
      as?: string;
    }
  | {
      op: "connect";
      from: string;
      to: string;
      name?: string;
      route?: Route;
      arrow?: Arrow;
      fromPoint?: Point;
      toPoint?: Point;
      look?: Look;
      as?: string;
    }
  | { op: "branch"; from: string; name?: string; as?: string }
  | { op: "reference"; from: string; to: string; name?: string; as?: string }
  | { op: "contain"; items: string[]; in: string | null }
  | { op: "relabel"; item: string; name: string }
  | { op: "restyle"; items: string[]; look?: Look; route?: Route; arrow?: Arrow }
  | { op: "place"; item: string; to?: Placement; size?: Size; alone?: boolean }
  | {
      op: "arrange";
      items?: string[];
      align?: Edge;
      distribute?: "horizontal" | "vertical";
      tidy?: string;
    }
  | { op: "remove"; items: string[] }
  | { op: "comment"; on: string; text: string }
  | { op: "reply"; to: string; text: string }
  | { op: "resolve"; discussion: string; resolved?: boolean }
  | { op: "title"; title: string }
  | { op: "view"; name: string; center: Point; zoom: number };

export type OperationOf<Name extends Operation["op"]> = Extract<Operation, { op: Name }>;

/** What one batch of operations works with. */
export class OperationContext {
  index: CanvasIndex;
  readonly handles = new Map<string, string>();

  constructor(
    readonly document: CanvasDocument,
    readonly author: string
  ) {
    this.index = new CanvasIndex(projectCanvas(document));
  }
  refresh() {
    this.index = new CanvasIndex(projectCanvas(this.document));
  }
  find(ref: string) {
    return this.index.find(this.handles.get(ref) ?? ref);
  }
  box(ref: string) {
    return this.index.box(this.handles.get(ref) ?? ref);
  }
  remember(handle: string | undefined, id: string) {
    if (!handle) return;
    if (this.handles.has(handle))
      throw new DomainError(`The handle "${handle}" is already used in this batch.`);
    this.handles.set(handle, id);
  }
  object(id: string): CanvasObject {
    return this.document.get(id)!;
  }
  /** A placement whose references may name items created earlier in the batch. */
  placement(placement: Placement): Placement {
    const id = (ref: string) => this.handles.get(ref) ?? ref;
    if ("beside" in placement) return { ...placement, beside: id(placement.beside) };
    if ("inside" in placement) return { inside: id(placement.inside) };
    if ("alignWith" in placement) return { ...placement, alignWith: id(placement.alignWith) };
    return placement;
  }
}

/** The existing items an operation acts on, before any handles from its batch are created. */
export function targetsOf(op: Operation): string[] {
  const pick = TARGETS[op.op] as (op: Operation) => (string | null | undefined)[];
  return pick(op).filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
}

type Targets = {
  [Name in Operation["op"]]: (op: OperationOf<Name>) => (string | null | undefined)[];
};
const TARGETS: Targets = {
  add: (op) => [op.inside],
  connect: (op) => [op.from, op.to],
  branch: (op) => [op.from],
  reference: (op) => [op.from, op.to],
  contain: (op) => [...op.items, op.in],
  relabel: (op) => [op.item],
  restyle: (op) => op.items,
  place: (op) => [op.item],
  arrange: (op) => [...(op.items ?? []), op.tidy],
  remove: (op) => op.items,
  comment: (op) => [op.on],
  reply: () => [],
  resolve: () => [],
  title: () => [],
  view: () => [],
};
