import type { CellStyle } from "@maxgraph/core";
import type { CanvasObject, ObjectKind } from "../document/types";
import { iconImage, loadIcons } from "./icons";

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
    const image = iconImage(style.icon, style.iconColor);
    if (image) Object.assign(style, { shape: "image", image });
    else void loadIcons();
  }
  return style;
}
