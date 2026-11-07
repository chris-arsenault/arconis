import type { CanvasDocument } from "../document/canvasDocument";
import { listComments, type CanvasComment } from "../document/comments";
import { isVertexKind } from "../document/geometry";
import { PICTURE_HASH, PICTURE_STORED, PICTURE_TYPE } from "../document/pictures";
import { LINE_ANCHOR, RELATION_BRANCH, RELATION_REFERENCE } from "../document/relations";
import { SCREEN_SIZES } from "../document/screens";
import type { CanvasObject, ObjectKind, SavedView, StyleValue } from "../document/types";
import {
  readArrow,
  readExtra,
  readLook,
  readRoute,
  type Arrow,
  type Look,
  type Route,
} from "./look";

/**
 * The canvas in the terms people and agents reason about. Yjs stays canonical: this is a projection
 * of it, and every change goes back through the document's own rules.
 */
export const STENCILS = [
  "rectangle",
  "ellipse",
  "decision",
  "service",
  "database",
  "cloud",
  "person",
  "icon",
] as const;
export type Stencil = (typeof STENCILS)[number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Common {
  id: string;
  name: string;
  /** The item holding this one. */
  inside?: string;
  look?: Look;
  /** Editor settings with no domain meaning. Keep them when rewriting an item. */
  extra?: Record<string, StyleValue>;
}
export interface NodeItem extends Common, Box {
  type: "node";
  stencil: Stencil;
  icon?: string;
  /** The line this node sits on, letting a line act as a topic. */
  onLine?: string;
}
export interface RegionItem extends Common, Box {
  type: "region";
  frame: "panel" | "group";
  /** A common screen whose size this region has, if any. */
  screen?: string;
}
export interface TextItem extends Common, Box {
  type: "text";
  /** A sticky note rather than plain text. */
  note: boolean;
}
export interface PictureItem extends Common, Box {
  type: "picture";
  picture: { hash: string; type: string; stored: boolean };
}
export interface Point {
  x: number;
  y: number;
}
interface LinkCommon extends Common {
  from: string;
  to: string;
  /** Where the line leaves and meets its ends, as fractions of their boxes. */
  fromPoint?: Point;
  toPoint?: Point;
  /** Bend points the line passes through. */
  via?: [number, number][];
}
export interface ConnectionItem extends LinkCommon {
  type: "connection";
  route: Route;
  arrow: Arrow;
}
/** One step of a topic tree: `from` is the parent topic and `to` the child. */
export interface BranchItem extends LinkCommon {
  type: "branch";
}
/** A pointer from one item to another that implies no structure. */
export interface ReferenceItem extends LinkCommon {
  type: "reference";
}
/** Freehand drawing. Agents read and move drawings but do not author them yet. */
export interface DrawingItem extends Common {
  type: "drawing";
  points: [number, number][];
}
export type BoxItem = NodeItem | RegionItem | TextItem | PictureItem;
export type LinkItem = ConnectionItem | BranchItem | ReferenceItem;
export type DomainItem = BoxItem | LinkItem | DrawingItem;

export interface DiscussionComment {
  id: string;
  author: string;
  text: string;
  time: number;
}
export interface Discussion {
  id: string;
  on: string;
  resolved: boolean;
  comments: DiscussionComment[];
}
export interface View {
  id: string;
  name: string;
  center?: Point;
  zoom: number;
}
export interface Canvas {
  title: string;
  /** In stacking order, back to front. */
  items: DomainItem[];
  discussions: Discussion[];
  views: View[];
}

const NODE_STENCILS: Partial<Record<ObjectKind, Stencil>> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "decision",
  service: "service",
  database: "database",
  cloud: "cloud",
  person: "person",
  icon: "icon",
};

export function isBoxItem(item: DomainItem): item is BoxItem {
  return (
    item.type === "node" ||
    item.type === "region" ||
    item.type === "text" ||
    item.type === "picture"
  );
}
export function isLinkItem(item: DomainItem): item is LinkItem {
  return item.type === "connection" || item.type === "branch" || item.type === "reference";
}

function common(object: CanvasObject, parents: Set<string>): Common {
  const result: Common = { id: object.id, name: object.label };
  if (object.parent && parents.has(object.parent)) result.inside = object.parent;
  const look = readLook(object.style);
  if (Object.keys(look).length) result.look = look;
  const extra = readExtra(object.style);
  if (extra) result.extra = extra;
  return result;
}

function box({ x, y, width, height }: CanvasObject): Box {
  return { x, y, width, height };
}

function point(x: StyleValue | undefined, y: StyleValue | undefined) {
  return typeof x === "number" && typeof y === "number" ? { x, y } : undefined;
}

function linkCommon(object: CanvasObject, base: Common): LinkCommon {
  const result: LinkCommon = { ...base, from: object.source, to: object.target };
  const fromPoint = point(object.style.exitX, object.style.exitY);
  const toPoint = point(object.style.entryX, object.style.entryY);
  const via = JSON.parse(object.points) as [number, number][];
  if (fromPoint) result.fromPoint = fromPoint;
  if (toPoint) result.toPoint = toPoint;
  if (via.length) result.via = via;
  return result;
}

function link(object: CanvasObject, base: Common): LinkItem {
  const common = linkCommon(object, base);
  if (object.style.relation === RELATION_BRANCH) return { ...common, type: "branch" };
  if (object.style.relation === RELATION_REFERENCE) return { ...common, type: "reference" };
  return {
    ...common,
    type: "connection",
    route: readRoute(object.style),
    arrow: readArrow(object.style),
  };
}

function screenOf(object: CanvasObject) {
  return SCREEN_SIZES.find((size) => size.width === object.width && size.height === object.height)
    ?.name;
}

function regionItem(object: CanvasObject, base: Common): RegionItem {
  const frame = object.kind === "group" ? "group" : "panel";
  const region: RegionItem = { ...base, ...box(object), type: "region", frame };
  const screen = screenOf(object);
  if (screen) region.screen = screen;
  return region;
}

function pictureItem(object: CanvasObject, base: Common): PictureItem {
  return {
    ...base,
    ...box(object),
    type: "picture",
    picture: {
      hash: String(object.style[PICTURE_HASH] ?? ""),
      type: String(object.style[PICTURE_TYPE] ?? ""),
      stored: object.style[PICTURE_STORED] === true,
    },
  };
}

function boxItem(object: CanvasObject, base: Common): BoxItem {
  const geometry = box(object);
  if (object.kind === "group" || object.kind === "panel") return regionItem(object, base);
  if (object.kind === "sticky" || object.kind === "text")
    return { ...base, ...geometry, type: "text", note: object.kind === "sticky" };
  if (object.kind === "picture") return pictureItem(object, base);
  const node: NodeItem = {
    ...base,
    ...geometry,
    type: "node",
    stencil: NODE_STENCILS[object.kind]!,
  };
  if (typeof object.style.icon === "string") node.icon = object.style.icon;
  if (typeof object.style[LINE_ANCHOR] === "string") node.onLine = object.style[LINE_ANCHOR];
  return node;
}

/** One stored object in domain terms. */
export function toItem(object: CanvasObject, present: Set<string>): DomainItem {
  const base = common(object, present);
  if (object.kind === "connector") return link(object, base);
  if (object.kind === "stroke")
    return { ...base, type: "drawing", points: JSON.parse(object.points) as [number, number][] };
  return isVertexKind(object.kind) ? boxItem(object, base) : link(object, base);
}

export function toDiscussions(comments: CanvasComment[]): Discussion[] {
  const roots = comments.filter((comment) => !comment.thread);
  return roots.map((root) => ({
    id: root.id,
    on: root.objectId,
    resolved: root.resolved,
    comments: [root, ...comments.filter((comment) => comment.thread === root.id)].map(
      ({ id, author, text, time }) => ({ id, author, text, time })
    ),
  }));
}

export function toView(saved: SavedView): View {
  const view: View = { id: saved.id, name: saved.name, zoom: saved.scale };
  if (saved.centerX !== undefined && saved.centerY !== undefined)
    view.center = { x: saved.centerX, y: saved.centerY };
  return view;
}

export function readViews(document: CanvasDocument) {
  return [...document.views.values()].flatMap((value) => {
    try {
      return [toView(JSON.parse(value) as SavedView)];
    } catch {
      return [];
    }
  });
}

export function projectCanvas(document: CanvasDocument): Canvas {
  const objects = document.list();
  const present = new Set(objects.map((object) => object.id));
  return {
    title: document.title(),
    items: objects.map((object) => toItem(object, present)),
    discussions: toDiscussions(listComments(document)),
    views: readViews(document),
  };
}
