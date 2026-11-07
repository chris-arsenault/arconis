import { addComment, listComments, setResolved, MAX_COMMENT_LENGTH } from "../document/comments";
import {
  LINE_ANCHOR,
  RELATION_BRANCH,
  RELATION_REFERENCE,
  alignOffsets,
  branchCopiesParent,
  branchDescendants,
  branchPlacement,
  distributeOffsets,
  movedWithContents,
  tidyBranch,
  type Offset,
} from "../document/relations";
import type { CanvasObject, ObjectKind, StyleValue } from "../document/types";
import { DomainError, label } from "./canvasIndex";
import { OperationContext, type Operation, type OperationOf, type Size } from "./context";
import { arrowStyle, routeStyle, writeLook } from "./look";
import { isBoxItem, type DomainItem, type Stencil } from "./model";
import { defaultSpot, resolvePlacement, type Placement } from "./placement";

const NODE_KINDS: Record<Stencil, ObjectKind> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  decision: "diamond",
  service: "service",
  database: "database",
  cloud: "cloud",
  person: "person",
  icon: "icon",
};
const ANCHOR_SIZE = 14;

function kindOf(op: Extract<Operation, { op: "add" }>): ObjectKind {
  if (op.type === "region") return op.frame ?? "panel";
  if (op.type === "text") return op.note ? "sticky" : "text";
  if (op.stencil === "icon" && !op.icon) throw new DomainError("An icon node needs an icon key.");
  return NODE_KINDS[op.stencil ?? "rectangle"];
}

function overlapNote(context: OperationContext, id: string) {
  context.refresh();
  const item = context.index.byId.get(id);
  if (!item || !isBoxItem(item)) return "";
  const others = context.index.overlaps(item);
  return others.length ? `; overlaps ${quoted(others)}` : "; overlaps nothing";
}

function where(context: OperationContext, id: string) {
  const object = context.object(id);
  const holder = object.parent ? context.index.byId.get(object.parent) : undefined;
  const inside = holder ? ` inside "${label(holder)}"` : "";
  return `at ${round(object.x)},${round(object.y)}, ${round(object.width)}×${round(object.height)}${inside}`;
}
const round = (value: number) => Math.round(value * 100) / 100;

/** Where a new item goes, and what holds it. */
function spotFor(context: OperationContext, op: OperationOf<"add">, size: Size) {
  const placement: Placement | null = op.at ?? (op.inside ? { inside: op.inside } : null);
  if (!placement) return { ...defaultSpot(context.index), holder: "" };
  const spot = resolvePlacement(context.index, context.placement(placement), size, null);
  return { ...spot, holder: op.inside ? context.box(op.inside).id : (spot.inside ?? "") };
}

function add(context: OperationContext, op: OperationOf<"add">) {
  const kind = kindOf(op);
  const { document } = context;
  const draft = document.build(kind, 0, 0, op.size ?? {});
  const spot = spotFor(context, op, { width: draft.width, height: draft.height });
  const holder = spot.holder;
  const style: Record<string, StyleValue> = { ...draft.style, ...writeLook(op.look ?? {}) };
  if (op.icon) style.icon = op.icon;
  const item = {
    ...draft,
    x: spot.x,
    y: spot.y,
    label: op.name ?? "",
    parent: holder,
    style,
  };
  document.insert(item);
  context.remember(op.as, item.id);
  context.refresh();
  return `Added ${op.type} "${op.name ?? ""}" (${item.id}) ${where(context, item.id)}${overlapNote(context, item.id)}`;
}

function endpoint(context: OperationContext, ref: string) {
  const item = context.find(ref);
  if (isBoxItem(item)) return item.id;
  if (item.type === "drawing")
    throw new DomainError(`"${label(item)}" is a drawing and cannot be linked.`);
  return anchorFor(context, item.id);
}

/** The small node standing in for a line in topic links, created on first use. */
function anchorFor(context: OperationContext, lineId: string) {
  const existing = context.index.canvas.items.find(
    (item) => item.type === "node" && item.onLine === lineId
  );
  if (existing) return existing.id;
  const line = context.object(lineId);
  const [from, to] = [context.object(line.source), context.object(line.target)];
  const middle = {
    x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
    y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
  };
  const anchor = context.document.build(
    "ellipse",
    middle.x - ANCHOR_SIZE / 2,
    middle.y - ANCHOR_SIZE / 2,
    {
      width: ANCHOR_SIZE,
      height: ANCHOR_SIZE,
      style: {
        [LINE_ANCHOR]: lineId,
        fillColor: "#7863d4",
        strokeColor: "#ffffff",
        movable: false,
        resizable: false,
        rotatable: false,
        spacing: 0,
      },
    }
  );
  context.document.insert(anchor);
  context.refresh();
  return anchor.id;
}

function boxEnd(context: OperationContext, ref: string) {
  return context.box(ref).id;
}

function connect(context: OperationContext, op: Extract<Operation, { op: "connect" }>) {
  const [source, target] = [boxEnd(context, op.from), boxEnd(context, op.to)];
  const style: Record<string, StyleValue> = writeLook(op.look ?? {});
  if (op.route) style.edgeStyle = routeStyle(op.route);
  if (op.arrow) style.endArrow = arrowStyle(op.arrow);
  for (const [prefix, value] of [
    ["exit", op.fromPoint],
    ["entry", op.toPoint],
  ] as const) {
    if (!value) continue;
    if ([value.x, value.y].some((n) => n < 0 || n > 1))
      throw new DomainError("Connection points are fractions of the box, from 0 to 1.");
    Object.assign(style, { [`${prefix}X`]: value.x, [`${prefix}Y`]: value.y });
  }
  const line = context.document.build("connector", 0, 0, {
    source,
    target,
    label: op.name ?? "",
    style,
  });
  context.document.insert(line);
  context.remember(op.as, line.id);
  return `Connected "${label(context.find(source))}" to "${label(context.find(target))}" (${line.id})`;
}

function branch(context: OperationContext, op: Extract<Operation, { op: "branch" }>) {
  const parent = context.object(endpoint(context, op.from));
  const { document } = context;
  const copies = branchCopiesParent(parent);
  const kind = copies ? parent.kind : "rectangle";
  const size = copies ? { width: parent.width, height: parent.height } : { width: 160, height: 90 };
  const placed = branchPlacement(document.list(), parent, size);
  const node = document.build(kind, placed.x, placed.y, {
    ...size,
    label: op.name ?? "",
    parent: parent.parent,
    style: copies ? { ...parent.style } : {},
  });
  document.insert(node);
  document.insert(
    document.build("connector", 0, 0, {
      source: parent.id,
      target: node.id,
      style: {
        relation: RELATION_BRANCH,
        endArrow: "none",
        exitX: placed.towardLeft ? 0 : 1,
        exitY: 0.5,
        entryX: placed.towardLeft ? 1 : 0,
        entryY: 0.5,
      },
    })
  );
  context.remember(op.as, node.id);
  context.refresh();
  return `Branched "${op.name ?? ""}" (${node.id}) from "${label(context.find(parent.id))}" ${where(context, node.id)}${overlapNote(context, node.id)}`;
}

function reference(context: OperationContext, op: Extract<Operation, { op: "reference" }>) {
  const [source, target] = [endpoint(context, op.from), endpoint(context, op.to)];
  const line = context.document.build("connector", 0, 0, {
    source,
    target,
    label: op.name ?? "",
    style: {
      relation: RELATION_REFERENCE,
      dashed: true,
      edgeStyle: "none",
      endArrow: "open",
      strokeColor: "#a797cc",
    },
  });
  context.document.insert(line);
  context.remember(op.as, line.id);
  return `Referenced "${label(context.find(target))}" from "${label(context.find(source))}" (${line.id})`;
}

function contain(context: OperationContext, op: Extract<Operation, { op: "contain" }>) {
  const holder = op.in === null ? null : context.box(op.in);
  const moved = op.items.map((ref) => context.find(ref));
  for (const item of moved) {
    if (holder && (holder.id === item.id || context.index.holders(holder.id).includes(item.id)))
      throw new DomainError(`"${label(item)}" cannot go inside itself or something it holds.`);
    context.document.patch(item.id, { parent: holder?.id ?? "" });
  }
  const names = quoted(moved);
  return holder ? `Put ${names} inside "${label(holder)}"` : `Took ${names} out to the canvas`;
}

function relabel(context: OperationContext, op: Extract<Operation, { op: "relabel" }>) {
  const item = context.find(op.item);
  context.document.editText(item.id, op.name);
  return `Renamed "${label(item)}" to "${op.name}"`;
}

function restyle(context: OperationContext, op: Extract<Operation, { op: "restyle" }>) {
  const items = op.items.map((ref) => context.find(ref));
  for (const item of items) {
    const style = writeLook(op.look ?? {}, context.object(item.id).style);
    if (op.route || op.arrow) {
      if (item.type !== "connection")
        throw new DomainError(`"${label(item)}" is not a connection, so it has no route or arrow.`);
      if (op.route) style.edgeStyle = routeStyle(op.route);
      if (op.arrow) style.endArrow = arrowStyle(op.arrow);
    }
    context.document.patchStyle(item.id, style);
  }
  return `Restyled ${quoted(items)}`;
}

/** Moves items with what they hold and, unless told otherwise, the topics branching from them. */
function shift(context: OperationContext, offsets: Map<string, Offset>, alone = false) {
  const items = context.document.list();
  const moves = new Map<string, Partial<CanvasObject>>();
  offsets.forEach(({ dx, dy }, id) => {
    if (!dx && !dy) return;
    const followers = alone ? [] : branchDescendants(items, id);
    [id, ...followers].forEach((target) =>
      movedWithContents(items, target, dx, dy).forEach(({ id: moved, values }) =>
        moves.set(moved, values)
      )
    );
  });
  moves.forEach((values, id) => context.document.patch(id, values));
}

function place(context: OperationContext, op: Extract<Operation, { op: "place" }>) {
  const item = context.box(op.item);
  if (op.size) context.document.patch(item.id, op.size);
  const size = op.size ?? item;
  if (op.to) {
    const spot = resolvePlacement(context.index, context.placement(op.to), size, item, item.id);
    if (spot.inside && spot.inside !== item.inside)
      contain(context, { op: "contain", items: [item.id], in: spot.inside });
    shift(context, new Map([[item.id, { dx: spot.x - item.x, dy: spot.y - item.y }]]), op.alone);
  }
  context.refresh();
  return `Placed "${label(item)}" ${where(context, item.id)}${overlapNote(context, item.id)}`;
}

function arrange(context: OperationContext, op: Extract<Operation, { op: "arrange" }>) {
  if (op.tidy) {
    const root = context.box(op.tidy);
    const items = context.document.list();
    const offsets = new Map<string, Offset>();
    tidyBranch(items, root.id).forEach(({ x, y }, id) => {
      const current = items.find((candidate) => candidate.id === id)!;
      offsets.set(id, { dx: x - current.x, dy: y - current.y });
    });
    shift(context, offsets, true);
    return `Tidied the topics branching from "${label(root)}": ${positions(context, [...offsets.keys()])}`;
  }
  const boxes = (op.items ?? []).map((ref) => context.box(ref));
  if (boxes.length < 2)
    throw new DomainError("Arranging needs at least two items, or a topic to tidy.");
  if (op.align) shift(context, alignOffsets(boxes, op.align));
  else if (op.distribute) shift(context, distributeOffsets(boxes, op.distribute));
  else throw new DomainError("Say how to arrange: align, distribute or tidy.");
  return `Arranged ${positions(
    context,
    boxes.map((item) => item.id)
  )}`;
}

/** Where items ended up, so the reader need not read them again. */
function positions(context: OperationContext, ids: string[]) {
  if (!ids.length) return "nothing needed to move";
  return ids
    .map((id) => {
      const object = context.object(id);
      return `"${label(context.find(id))}" at ${round(object.x)},${round(object.y)}`;
    })
    .join(", ");
}

function remove(context: OperationContext, op: Extract<Operation, { op: "remove" }>) {
  const items = op.items.map((ref) => context.find(ref));
  const before = new Map(context.index.canvas.items.map((item) => [item.id, item]));
  context.document.remove(items.map((item) => item.id));
  context.refresh();
  const requested = new Set(items.map((item) => item.id));
  const along = [...before.values()].filter(
    (item) => !requested.has(item.id) && !context.index.byId.has(item.id)
  );
  const alongNames = along.map(describeBrief).join(", ");
  const extra = along.length ? `, and with them ${alongNames}` : "";
  return `Removed ${quoted(items)}${extra}`;
}

function quoted(items: DomainItem[]) {
  return items.map((item) => '"' + label(item) + '"').join(", ");
}

function describeBrief(item: DomainItem) {
  return item.name ? `${item.type} "${item.name}"` : `${item.type} ${item.id}`;
}

function checkText(text: string) {
  if (!text.trim()) throw new DomainError("A comment needs some text.");
  if (text.length > MAX_COMMENT_LENGTH)
    throw new DomainError(`Comments are limited to ${MAX_COMMENT_LENGTH} characters.`);
}

function rootComment(context: OperationContext, id: string) {
  const root = listComments(context.document).find(
    (comment) => comment.id === id && !comment.thread
  );
  if (!root) throw new DomainError(`No discussion has the id "${id}".`);
  return root;
}

const DISPATCH: {
  [Name in Operation["op"]]: (
    context: OperationContext,
    op: Extract<Operation, { op: Name }>
  ) => string;
} = {
  add,
  connect,
  branch,
  reference,
  contain,
  relabel,
  restyle,
  place,
  arrange,
  remove,
  comment: (context, op) => {
    checkText(op.text);
    const item = context.find(op.on);
    const id = addComment(context.document, {
      objectId: item.id,
      author: context.author,
      text: op.text,
    });
    return `Started discussion ${id} on "${label(item)}"`;
  },
  reply: (context, op) => {
    checkText(op.text);
    const root = rootComment(context, op.to);
    addComment(context.document, {
      objectId: root.objectId,
      author: context.author,
      text: op.text,
      thread: root.id,
    });
    return `Replied in discussion ${root.id}`;
  },
  resolve: (context, op) => {
    const root = rootComment(context, op.discussion);
    setResolved(context.document, root.id, op.resolved ?? true);
    return `${op.resolved === false ? "Reopened" : "Resolved"} discussion ${root.id}`;
  },
  title: (context, op) => {
    context.document.rename(op.title);
    return `Titled the canvas "${op.title}"`;
  },
  view: (context, op) => {
    if (!Number.isFinite(op.zoom) || op.zoom <= 0)
      throw new DomainError("A view's zoom must be above zero.");
    const id = crypto.randomUUID();
    const { x, y } = op.center;
    context.document.views.set(
      id,
      JSON.stringify({ id, name: op.name, centerX: x, centerY: y, x: -x, y: -y, scale: op.zoom })
    );
    return `Saved the view "${op.name}" (${id})`;
  },
};

export function runOperation(context: OperationContext, op: Operation) {
  const handler = DISPATCH[op.op] as
    ((context: OperationContext, op: Operation) => string) | undefined;
  if (!handler)
    throw new DomainError(`There is no "${String((op as { op: unknown }).op)}" operation.`);
  const message = handler(context, op);
  context.refresh();
  return message;
}
