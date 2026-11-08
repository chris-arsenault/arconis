import type { CellStyle } from "@maxgraph/core";
import type { Item, LinePath, Look } from "../document/types";
import { isLockedIcon } from "../document/geometry";
import { iconImage, loadIconFor } from "./icons";
import { isPictureHash, isPictureType } from "../document/pictures";
import { pictureImage } from "./pictureSource";
import { LABEL_BADGE, LABEL_SUBTITLE } from "./rendering";
import { TEXT_FONTS } from "../text/typography";

/**
 * The one place an item's look becomes maxGraph styles. The model speaks in plain terms; everything
 * here is how the renderer draws them.
 */
type Style = CellStyle & Record<string, unknown>;

const BASE_STYLE: Style = {
  shape: "rectangle",
  fillColor: "#ffffff",
  strokeColor: "#9ca5b8",
  fontColor: "#283249",
  fontSize: 14,
  fontFamily: "Inter, system-ui, sans-serif",
  whiteSpace: "wrap",
  overflow: "hidden",
  rounded: true,
  arcSize: 12,
  spacing: 14,
  strokeWidth: 1,
};

const STENCIL_STYLES: Record<string, Style> = {
  ellipse: { shape: "ellipse" },
  decision: { shape: "rhombus" },
  database: { shape: "cylinder" },
  person: { shape: "actor" },
  cloud: { shape: "cloud" },
  // A point where lines meet, drawn as a dot in the lines' color.
  junction: {
    shape: "ellipse",
    fillColor: "#7f8aa3",
    strokeColor: "none",
    resizable: false,
    rotatable: false,
    noLabel: true,
  },
  icon: {
    fillColor: "none",
    strokeColor: "none",
    rounded: false,
    verticalLabelPosition: "bottom",
    verticalAlign: "top",
    whiteSpace: "nowrap",
    overflow: "visible",
    spacing: 2,
    fontSize: 12,
    imageAspect: true,
  },
};

const TYPE_STYLES: Partial<Record<Item["type"], Style>> = {
  note: {
    fillColor: "#fff0ad",
    strokeColor: "none",
    shadow: true,
    rounded: false,
    align: "left",
    verticalAlign: "top",
    fontSize: 16,
    spacing: 20,
  },
  text: { fillColor: "none", strokeColor: "none", fontSize: 22 },
  group: {
    fillColor: "#f3f0fc",
    fillOpacity: 35,
    strokeColor: "#a797cc",
    dashed: true,
    verticalAlign: "top",
    fontSize: 12,
    // A rotated frame would no longer contain its children; children rotate instead.
    rotatable: false,
  },
  frame: {
    shape: "swimlane",
    startSize: 28,
    fillColor: "#eef0f5",
    swimlaneFillColor: "#ffffff",
    strokeColor: "#b9bfcd",
    fontSize: 13,
    fontStyle: 1,
    whiteSpace: "nowrap",
    overflow: "visible",
    rounded: false,
    rotatable: false,
  },
  card: {
    shape: "label",
    align: "left",
    spacingLeft: 76,
    imageAlign: "left",
    imageVerticalAlign: "middle",
    imageWidth: 52,
    imageHeight: 52,
    rounded: false,
  },
  band: {
    fillColor: "#e6f6f7",
    strokeColor: "none",
    rounded: false,
    verticalAlign: "top",
    fontSize: 13,
    rotatable: false,
  },
  line: {
    shape: "connector",
    edgeStyle: "orthogonalEdgeStyle",
    rounded: true,
    endArrow: "block",
    strokeColor: "#7f8aa3",
    strokeWidth: 2,
    labelBackgroundColor: "#f7f8fc",
    whiteSpace: "nowrap",
    overflow: "visible",
    fontSize: 14,
    startSize: 6,
    endSize: 6,
  },
  drawing: {
    shape: "connector",
    edgeStyle: "none",
    endArrow: "none",
    startArrow: "none",
    strokeColor: "#6554c0",
    strokeWidth: 3,
    curved: true,
    // A drawing moves and transforms as one item, not as hundreds of waypoints.
    bendable: false,
  },
  // A viewport over the canvas: an outline that covers nothing, labelled above itself so a
  // presentation masking everything outside the box shows neither.
  slide: {
    fillColor: "none",
    strokeColor: "#7863d4",
    rounded: false,
    aspect: "fixed",
    rotatable: false,
    verticalLabelPosition: "top",
    verticalAlign: "bottom",
    align: "left",
    whiteSpace: "nowrap",
    overflow: "visible",
    fontSize: 12,
    fontStyle: 1,
    fontColor: "#5443b3",
    spacing: 4,
  },
  // Shows as a plain frame until its bytes arrive.
  picture: {
    fillColor: "#eef0f5",
    strokeColor: "#d5daea",
    rounded: false,
    aspect: "fixed",
    verticalLabelPosition: "bottom",
    verticalAlign: "top",
    whiteSpace: "nowrap",
    overflow: "visible",
    fontSize: 12,
    spacing: 2,
  },
};

/** Frame titles that are not a header bar: plain text at the top left, or down one side. */
const TITLE_STYLES: Record<string, Style> = {
  top: {
    shape: "rectangle",
    fillColor: "none",
    align: "left",
    verticalAlign: "top",
    fontStyle: 1,
    spacing: 8,
    spacingLeft: 10,
  },
  side: { horizontal: false },
};

const REFERENCE_STYLE: Style = {
  // Lets the view hide references without asking the document about every cell it draws.
  reference: true,
  dashed: true,
  edgeStyle: "none",
  endArrow: "open",
  strokeColor: "#a797cc",
};
/** The small handle a line grows when it takes part in a topic tree or a reference. */
const LINE_ANCHOR_STYLE: Style = {
  shape: "ellipse",
  fillColor: "#7863d4",
  strokeColor: "#ffffff",
  movable: false,
  resizable: false,
  rotatable: false,
  spacing: 0,
};

/**
 * How each line type draws through its points. Cornered lines take maxGraph's segment routing, whose
 * segments people drag; diagonal and curved lines run through points people drag.
 */
const PATHS: Record<LinePath, Style> = {
  cornered: { edgeStyle: "orthogonalEdgeStyle", curved: false },
  diagonal: { edgeStyle: "none", curved: false },
  curved: { edgeStyle: "none", curved: true },
};
const ARROWS = { arrow: "block", open: "open", none: "none" };
const BOLD = 1;
const ITALIC = 2;
/** Style values that follow an item's scale, so deep-zoom items keep familiar proportions. */
const SCALED = ["fontSize", "strokeWidth", "spacing", "spacingLeft", "startSize", "endSize"];

function typeStyle(item: Item): Style {
  if (item.onLine) return LINE_ANCHOR_STYLE;
  if (item.type === "node") return STENCIL_STYLES[item.stencil] ?? {};
  if (item.type === "branch") return { ...TYPE_STYLES.line, endArrow: "none" };
  if (item.type === "reference") return { ...TYPE_STYLES.line, ...REFERENCE_STYLE };
  return TYPE_STYLES[item.type] ?? {};
}

/** Look properties that map one to one onto a maxGraph style key. */
const DIRECT: [keyof Look, string][] = [
  ["fill", "fillColor"],
  ["line", "strokeColor"],
  ["lineWidth", "strokeWidth"],
  ["textColor", "fontColor"],
  ["textSize", "fontSize"],
  ["align", "align"],
  ["valign", "verticalAlign"],
  ["padding", "spacing"],
  ["lineHeight", "labelLineHeight"],
  ["paragraphGap", "labelParagraphGap"],
  ["textHighlight", "labelHighlight"],
  ["rotation", "rotation"],
  ["dashed", "dashed"],
  ["opacity", "fillOpacity"],
];

/** Bold and italic are bits of one font style value, so each changes only its own bit. */
function fontStyle(look: Look, base: Style) {
  const bit = (font: number, on: boolean | undefined, mask: number) => {
    if (on === undefined) return font;
    return on ? font | mask : font & ~mask;
  };
  let result = bit(bit(Number(base.fontStyle ?? 0), look.bold, BOLD), look.italic, ITALIC);
  result = bit(result, look.underline, 4);
  return bit(result, look.strike, 8);
}

function lookStyle(look: Look, base: Style): Style {
  const result: Style = {};
  for (const [key, styleKey] of DIRECT) if (look[key] !== undefined) result[styleKey] = look[key];
  if (look.path) Object.assign(result, PATHS[look.path]);
  if (look.arrow) result.endArrow = ARROWS[look.arrow];
  if (look.startArrow) result.startArrow = ARROWS[look.startArrow];
  if (look.vertical) result.horizontal = false;
  result.fontStyle = fontStyle(look, base);
  if (look.font && TEXT_FONTS[look.font]) result.fontFamily = TEXT_FONTS[look.font];
  return result;
}

/** An item's look: its named style, then its own properties over it. */
export function resolvedLook(item: Item, named: Look = {}): Look {
  return { ...named, ...item.look };
}

/** Size-dependent values grow or shrink with an item's scale. */
function applyScale(style: Style, scale: number | undefined) {
  if (!scale || scale === 1) return;
  for (const key of SCALED) if (typeof style[key] === "number") style[key] *= scale;
}

function applyPorts(item: Item, style: Style) {
  if (item.fromPort) Object.assign(style, { exitX: item.fromPort[0], exitY: item.fromPort[1] });
  if (item.toPort) Object.assign(style, { entryX: item.toPort[0], entryY: item.toPort[1] });
}

/** What the label draws besides the name: a subtitle under it, a badge before it. */
function applyLabel(item: Item, style: Style, look: Look) {
  if (item.subtitle) style[LABEL_SUBTITLE] = item.subtitle;
  if (!look.badge) return;
  const badge = iconImage(look.badge);
  if (badge) style[LABEL_BADGE] = badge;
  else void loadIconFor(look.badge);
}

function baseStyle(item: Item, look: Look): Style {
  const base = { ...BASE_STYLE, ...typeStyle(item) };
  if (item.type === "frame" && look.title && look.title !== "header")
    Object.assign(base, TITLE_STYLES[look.title]);
  return base;
}

/** `presenting` draws slides as nothing at all: a presentation shows only what lies on them. */
export function objectStyle(item: Item, named: Look = {}, presenting = false): CellStyle {
  const look = resolvedLook(item, named);
  const base = baseStyle(item, look);
  const style: Style = { ...base, ...lookStyle(look, base) };
  applyScale(style, look.scale);
  applyPorts(item, style);
  if (isLockedIcon(item)) delete style.rotation;
  if (item.icon && (item.type === "node" || item.type === "card")) applyIcon(item, style, look);
  if (item.type === "picture") applyPicture(item, style);
  if (presenting && item.type === "slide")
    Object.assign(style, { strokeColor: "none", noLabel: true });
  applyLabel(item, style, look);
  return style;
}

/**
 * An underlay draws a template's item again where nothing can touch it: no pointer events, no
 * handles, no connections. It is dimmed while editing, so it reads as the template's, and plain
 * while presenting.
 */
export function underlayStyle(style: CellStyle, presenting: boolean): CellStyle {
  const opacity = presenting ? 100 : 55;
  const underlay: Style = {
    ...style,
    underlay: true,
    pointerEvents: false,
    movable: false,
    resizable: false,
    rotatable: false,
    editable: false,
    connectable: false,
    deletable: false,
    bendable: false,
    opacity,
    textOpacity: opacity,
  };
  return underlay;
}

/** Peers write items, so an image only ever comes from a local icon key resolved here. */
function applyIcon(item: Item, style: Style, look: Look) {
  if (isLockedIcon(item)) Object.assign(style, { aspect: "fixed", rotatable: false });
  const image = iconImage(item.icon, look.iconColor);
  if (!image) {
    void loadIconFor(item.icon);
    return;
  }
  if (item.type === "card") style.image = image;
  else Object.assign(style, { shape: "image", image });
}

/** Resolves only a validated hash through the room's pictures, so peers can never supply a URL. */
function applyPicture(item: Item, style: Style) {
  const picture = item.picture;
  if (!picture || !isPictureHash(picture.hash) || !isPictureType(picture.format)) return;
  const image = pictureImage(picture.hash, picture.format, picture.stored);
  if (image)
    Object.assign(style, { shape: "image", image, fillColor: "none", strokeColor: "none" });
}
