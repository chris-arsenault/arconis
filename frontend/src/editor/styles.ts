import type { CellStyle } from "@maxgraph/core";
import type { CanvasObject, ObjectKind } from "../document/types";
import { isLockedIcon } from "../document/geometry";
import { iconImage, loadIconFor } from "./icons";
import {
  PICTURE_HASH,
  PICTURE_STORED,
  PICTURE_TYPE,
  isPictureHash,
  isPictureType,
} from "../document/pictures";
import { pictureImage } from "./pictureSource";

const BASE_STYLE: CellStyle = {
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
};

const KIND_STYLES: Partial<Record<ObjectKind, CellStyle & Record<string, unknown>>> = {
  ellipse: { shape: "ellipse" },
  diamond: { shape: "rhombus" },
  database: { shape: "cylinder" },
  person: { shape: "actor" },
  cloud: { shape: "cloud" },
  sticky: {
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
  panel: {
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
  connector: {
    shape: "connector",
    edgeStyle: "orthogonalEdgeStyle",
    rounded: true,
    endArrow: "block",
    strokeColor: "#7f8aa3",
    strokeWidth: 2,
    labelBackgroundColor: "#f7f8fc",
    whiteSpace: "nowrap",
    overflow: "visible",
  },
  stroke: {
    shape: "connector",
    edgeStyle: "none",
    endArrow: "none",
    startArrow: "none",
    strokeColor: "#6554c0",
    strokeWidth: 3,
    curved: true,
    // A drawing moves and transforms as one object, not as hundreds of waypoints.
    bendable: false,
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

export function objectStyle(item: CanvasObject): CellStyle {
  // Peers write styles, so an image only ever comes from a local icon key resolved here.
  const style = { ...BASE_STYLE, ...KIND_STYLES[item.kind], ...item.style } as CellStyle &
    Record<string, unknown>;
  delete style.image;
  if (item.kind === "icon") {
    if (isLockedIcon(style)) {
      delete style.rotation;
      Object.assign(style, { aspect: "fixed", rotatable: false });
    }
    const image = iconImage(style.icon, style.iconColor);
    if (image) Object.assign(style, { shape: "image", image });
    else void loadIconFor(style.icon);
  }
  if (item.kind === "picture") applyPicture(style);
  return style;
}

/** Resolves only a validated hash through the room's pictures, so peers can never supply a URL. */
function applyPicture(style: Record<string, unknown>) {
  const hash = style[PICTURE_HASH];
  const type = style[PICTURE_TYPE];
  if (!isPictureHash(hash) || !isPictureType(type)) return;
  const image = pictureImage(hash, type, style[PICTURE_STORED] === true);
  if (image)
    Object.assign(style, { shape: "image", image, fillColor: "none", strokeColor: "none" });
}
