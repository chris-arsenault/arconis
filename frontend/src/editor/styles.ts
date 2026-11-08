import type { CellStyle } from "@maxgraph/core";
import { isLink, type Item, type LinePath, type Look } from "../document/types";
import { authoredLook, effectiveAppearance, type Appearance } from "../document/appearance";
import { isLockedIcon } from "../document/geometry";
import { iconImage, loadIconFor } from "../assets/icons/catalog";
import { isPictureHash, isPictureType } from "../document/pictures";
import { pictureImage } from "./pictureSource";
import { LABEL_BADGE, LABEL_SUBTITLE } from "./rendering";
import { TEXT_FONTS } from "../text/typography";
import "./inkShape";
import { isMarkup } from "../document/ink";

/**
 * The one place an item's look becomes maxGraph styles. The model speaks in plain terms; everything
 * here is how the renderer draws them.
 */
type Style = CellStyle & Record<string, unknown>;

const BASE_STYLE: Style = {
  shape: "rectangle",
  whiteSpace: "wrap",
  overflow: "hidden",
  rounded: true,
  arcSize: 12,
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
    resizable: false,
    rotatable: false,
    noLabel: true,
  },
  icon: {
    rounded: false,
    verticalLabelPosition: "bottom",
    whiteSpace: "nowrap",
    overflow: "visible",
    imageAspect: true,
  },
};

const TYPE_STYLES: Partial<Record<Item["type"], Style>> = {
  note: {
    shadow: true,
    rounded: false,
  },
  text: {},
  group: {
    // A rotated frame would no longer contain its children; children rotate instead.
    rotatable: false,
  },
  frame: {
    shape: "swimlane",
    startSize: 28,
    swimlaneFillColor: "#ffffff",
    whiteSpace: "nowrap",
    overflow: "visible",
    rounded: false,
    rotatable: false,
  },
  card: {
    shape: "label",
    spacingLeft: 76,
    imageAlign: "left",
    imageVerticalAlign: "middle",
    imageWidth: 52,
    imageHeight: 52,
    rounded: false,
  },
  band: {
    rounded: false,
    rotatable: false,
  },
  line: {
    shape: "connector",
    edgeStyle: "orthogonalEdgeStyle",
    rounded: true,
    labelBackgroundColor: "#f7f8fc",
    whiteSpace: "nowrap",
    overflow: "visible",
    startSize: 6,
    endSize: 6,
  },
  drawing: {
    shape: "ink",
    edgeStyle: "none",
    curved: true,
    // A drawing moves and transforms as one item, not as hundreds of waypoints.
    bendable: false,
    startSize: 6,
    endSize: 6,
  },
  sketch: {
    rounded: false,
    verticalLabelPosition: "bottom",
    whiteSpace: "nowrap",
    overflow: "visible",
    rotatable: false,
    resizable: false,
  },
  highlight: {
    rounded: true,
    noLabel: true,
    pointerEvents: false,
    movable: false,
    resizable: false,
    rotatable: false,
    connectable: false,
  },
  // A viewport over the canvas: an outline that covers nothing, labelled above itself so a
  // presentation masking everything outside the box shows neither.
  slide: {
    rounded: false,
    aspect: "fixed",
    rotatable: false,
    verticalLabelPosition: "top",
    whiteSpace: "nowrap",
    overflow: "visible",
  },
  // Shows as a plain frame until its bytes arrive.
  picture: {
    rounded: false,
    aspect: "fixed",
    verticalLabelPosition: "bottom",
    whiteSpace: "nowrap",
    overflow: "visible",
  },
};

/** Frame titles that are not a header bar: plain text at the top left, or down one side. */
const TITLE_STYLES: Record<string, Style> = {
  top: {
    shape: "rectangle",
    spacingLeft: 10,
  },
  side: { horizontal: false },
};

const REFERENCE_STYLE: Style = {
  // Lets the view hide references without asking the document about every cell it draws.
  reference: true,
  edgeStyle: "none",
};
/** The small handle a line grows when it takes part in a topic tree or a reference. */
const LINE_ANCHOR_STYLE: Style = {
  shape: "ellipse",
  movable: false,
  resizable: false,
  rotatable: false,
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
  ["strokeOpacity", "strokeOpacity"],
  ["gradient", "gradientColor"],
  ["closed", "inkClosed"],
  ["gradientAngle", "inkGradientAngle"],
];

function lookStyle(item: Item, look: Appearance): Style {
  const result: Style = {};
  for (const [key, styleKey] of DIRECT) if (look[key] !== undefined) result[styleKey] = look[key];
  if (isLink(item) || item.type === "drawing") {
    Object.assign(result, PATHS[look.path]);
    result.endArrow = ARROWS[look.arrow];
    result.startArrow = ARROWS[look.startArrow];
  }
  if (look.vertical) result.horizontal = false;
  result.fontStyle = fontFlags(look);
  if (look.font && TEXT_FONTS[look.font]) result.fontFamily = TEXT_FONTS[look.font];
  return result;
}

function fontFlags(look: Appearance) {
  return (
    (look.bold ? 1 : 0) | (look.italic ? 2 : 0) | (look.underline ? 4 : 0) | (look.strike ? 8 : 0)
  );
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
  const look = effectiveAppearance(item, named);
  const base = baseStyle(item, look);
  const style: Style = { ...base, ...lookStyle(item, look), markup: isMarkup(item) };
  // Mutation capture reads rotation from the model style. A default must not become an authored edit.
  if (authoredLook(item, named).rotation === undefined) delete style.rotation;
  applyScale(style, look.scale);
  applyPorts(item, style);
  if (isLockedIcon(item)) delete style.rotation;
  applyAssets(item, style, look);
  if (presenting && item.type === "slide")
    Object.assign(style, { strokeColor: "none", noLabel: true });
  applyLabel(item, style, look);
  return style;
}

function applyAssets(item: Item, style: Style, look: Look) {
  if (item.icon && (item.type === "node" || item.type === "card")) applyIcon(item, style, look);
  if (item.type === "picture") applyPicture(item, style);
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
