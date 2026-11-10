/**
 * The canvas model. The document stores these items field for field, the canvas language writes
 * them, and agents read and change them: one representation, which the editor turns into maxGraph
 * cells to draw.
 */
export type ItemType =
  | "node"
  | "card"
  | "frame"
  | "group"
  | "band"
  | "text"
  | "note"
  | "picture"
  | "slide"
  | "line"
  | "branch"
  | "reference"
  | "highlight"
  | "drawing";
export type InkKind =
  | "freehand"
  | "line"
  | "arrow"
  | "double-arrow"
  | "rectangle"
  | "ellipse"
  | "polygon"
  | "bracket"
  | "brace"
  | "cloud";

export const STENCILS = [
  "rectangle",
  "ellipse",
  "decision",
  "service",
  "database",
  "cloud",
  "person",
  "icon",
  "junction",
] as const;
export type Stencil = (typeof STENCILS)[number];

/**
 * A line's type: right-angled corners, straight diagonal segments or curves, each through the line's
 * points. Where the points come from, such as routing around items, is placement, not type.
 */
export type LinePath = "cornered" | "diagonal" | "curved";
export type Arrow = "arrow" | "open" | "none";
export const LINE_PATHS: LinePath[] = ["cornered", "diagonal", "curved"];
export const ARROWS: Arrow[] = ["arrow", "open", "none"];
/** Where a frame shows its title: a header bar, plain text at the top left, or a vertical side. */
export type TitlePlace = "header" | "top" | "side";
export const TITLE_PLACES: TitlePlace[] = ["header", "top", "side"];
export type Align = "left" | "center" | "right";
export type TextFont = "sans" | "serif" | "mono";
export type VerticalAlign = "top" | "middle" | "bottom";

/** How an item looks, in the words a person would use. Unset properties take the type's default. */
export interface Look {
  fill?: string;
  line?: string;
  lineWidth?: number;
  textColor?: string;
  textSize?: number;
  font?: TextFont;
  valign?: VerticalAlign;
  textHighlight?: string;
  /** Line height as a multiplier of font size; paragraph gap in em. */
  lineHeight?: number;
  paragraphGap?: number;
  /** Padding in canvas units, following the item's scale. */
  padding?: number;
  /** Grow a free-text box vertically while authoring, or keep its chosen size. */
  textFit?: "fixed" | "height";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: Align;
  rotation?: number;
  dashed?: boolean;
  /** Fill opacity, 0 to 100. */
  opacity?: number;
  /** Stroke transparency, independently of fill opacity. */
  strokeOpacity?: number;
  closed?: boolean;
  /** Second color and clockwise direction of a linear fill gradient. */
  gradient?: string;
  gradientAngle?: number;
  iconColor?: string;
  /** An icon key shown in a frame's corner. */
  badge?: string;
  title?: TitlePlace;
  /** Text, or a line's label, reads from bottom to top. */
  vertical?: boolean;
  path?: LinePath;
  /** The arrow where a line ends, and where it starts; a line starts with none by default. */
  arrow?: Arrow;
  startArrow?: Arrow;
  /**
   * How large text, lines and padding are relative to their defaults. Items made at deep zoom carry
   * a factor so they look familiar on screen at that zoom.
   */
  scale?: number;
}
export type LookKey = keyof Look;

/** A point on an item's box as fractions of its width and height, where a line attaches. */
export type Port = [number, number];
export type PathPoint = [number, number];

/**
 * How a frame keeps what it holds: in a row, a column or a grid of `columns`, `gap` apart, lined up
 * by `align`. Members keep their order by where they sit, so dragging one reorders it.
 */
export interface Arrangement {
  how: "row" | "column" | "grid";
  columns?: number;
  gap?: number;
  align?: "top" | "middle" | "bottom" | "left" | "center" | "right";
}

export interface PictureRef {
  hash: string;
  /** The image's media type. */
  format: string;
  /** Whether the bytes have reached the room's storage. */
  stored: boolean;
}

/** A small badge on any item: priority 1 (highest) to 5, or progress in quarters 0 to 4. */
export const MARKERS = ["p1", "p2", "p3", "p4", "p5", "q0", "q1", "q2", "q3", "q4"] as const;
export type Marker = (typeof MARKERS)[number];
export const TASK_STATES = ["open", "done"] as const;
export type TaskState = (typeof TASK_STATES)[number];
/** Flags any item carries; each is absent when off. */
export const FLAGS = ["locked", "hidden", "collapsed", "numbered"] as const;
export type Flag = (typeof FLAGS)[number];

export interface Item {
  /** Unique in the canvas. People see and type it, so it is short. */
  id: string;
  type: ItemType;
  name: string;
  /** A second line under the name, such as the technology behind a component. */
  subtitle: string;
  /** The item holding this one, or empty. */
  inside: string;
  /** World position of a box's top-left corner; lines and drawings keep zero. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stacking position, back to front; ties break by id so every peer draws the same order. */
  order: number;
  /** A named style from the canvas's styles, applied under the item's own look. */
  style: string;
  look: Look;
  /** For nodes and cards: what the shape is. */
  stencil: Stencil;
  icon: string;
  /** For links: the items at each end. */
  from: string;
  to: string;
  fromPort?: Port;
  toPort?: Port;
  /** A line's bend points, or a drawing's path, in world coordinates. */
  points: PathPoint[];
  /** The line a node sits on, which lets a line act as a topic. */
  onLine: string;
  picture?: PictureRef;
  /** For frames and groups that keep their contents arranged. */
  arrange?: Arrangement;
  /** Scale held content, including its paint and text, when this panel is resized. */
  scaleContents?: boolean;
  /** For slides: the deck this slide belongs to, and its number in that deck. */
  deck?: string;
  slide?: number;
  /** Shared annotation above the workspace, rather than workspace content. */
  markup?: boolean;
  /**
   * The content layer a top-level item is in, or absent for the base layer. What a holder holds
   * is in the holder's layer; markup and slides belong to none (`document/layers.ts`).
   */
  layer?: string;
  /** Geometry convention for an editable drawing path. */
  ink?: InkKind;
  /** A highlight follows this item's geometry without changing its style. */
  target?: string;
  /**
   * Fields every item type carries, whatever it is: a frame collapses as a topic does, a line
   * carries tags and a marker, a picture can be a task. Each is absent when it does not apply.
   */
  /** Pointer edits leave it alone until someone unlocks it; agents may still change it. */
  locked?: boolean;
  /** Not drawn, routed around, exported as a picture or counted by layout; its holder and lines stay. */
  hidden?: boolean;
  /** What it holds or heads is not drawn; a frame shrinks to its title bar. Shared with everyone. */
  collapsed?: boolean;
  /** Its branches show tiered numbers, 1, 1.1, 1.2, so people and agents can name them. */
  numbered?: boolean;
  /** Free categorical words, each an id-like word. */
  tags?: string[];
  marker?: Marker;
  /** A checkbox in the label; holders and topics over tasks show how many are done. */
  task?: TaskState;
  /** A web address, or the id of an item, slide or saved view to fly to. */
  link?: string;
  /** Who last changed the item, in their own words, and when in milliseconds. */
  editedBy?: string;
  editedAt?: number;
  /** Named values an item carries, such as owner or ticket, shown on hover and in labels as {key}. */
  properties?: Record<string, string>;
}

export interface View {
  id: string;
  name: string;
  center: { x: number; y: number };
  zoom: number;
}

export const LOCAL = Symbol("local editor");
export const COLORS = ["#fff0ad", "#ffd9da", "#d9e9ff", "#d8efdf", "#e7dafa", "#ffffff"];

const BOX_TYPES = [
  "node",
  "card",
  "frame",
  "group",
  "band",
  "text",
  "note",
  "picture",
  "slide",
  "highlight",
] as const;
const LINK_TYPES = ["line", "branch", "reference"] as const;
export type BoxItem = Item & { type: (typeof BOX_TYPES)[number] };
export type LinkItem = Item & { type: (typeof LINK_TYPES)[number] };
const boxes = new Set<ItemType>(BOX_TYPES);
const links = new Set<ItemType>(LINK_TYPES);

/** Items with a box: everything but links and drawings. */
export function isBox<T extends Pick<Item, "type">>(item: T): item is T & Pick<BoxItem, "type"> {
  return boxes.has(item.type);
}
export function isLink<T extends Pick<Item, "type">>(item: T): item is T & Pick<LinkItem, "type"> {
  return links.has(item.type);
}
/** Items that exist to hold others. Any box can hold children, but these have frame behavior. */
export function isFrame(item: Pick<Item, "type"> | undefined) {
  return item?.type === "frame" || item?.type === "group";
}

const STENCIL_LABELS: Record<Stencil, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  decision: "Decision",
  service: "Service",
  database: "Database",
  cloud: "Cloud",
  person: "Person",
  icon: "Icon",
  junction: "Junction",
};
const TYPE_LABELS: Record<ItemType, string> = {
  node: "Node",
  card: "Card",
  frame: "Frame",
  group: "Group",
  band: "Band",
  text: "Text",
  note: "Sticky note",
  picture: "Picture",
  slide: "Slide",
  line: "Line",
  branch: "Branch",
  reference: "Reference",
  drawing: "Ink",
  highlight: "Object highlight",
};

/** What a person calls this item when it has no name. */
export function typeLabel(item: Pick<Item, "type" | "stencil">) {
  return item.type === "node" ? STENCIL_LABELS[item.stencil] : TYPE_LABELS[item.type];
}
