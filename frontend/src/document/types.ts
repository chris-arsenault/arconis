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
  | "drawing";

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
  /** For slides: the deck this slide belongs to, and its number in that deck. */
  deck?: string;
  slide?: number;
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
  drawing: "Drawing",
};

/** What a person calls this item when it has no name. */
export function typeLabel(item: Pick<Item, "type" | "stencil">) {
  return item.type === "node" ? STENCIL_LABELS[item.stencil] : TYPE_LABELS[item.type];
}
