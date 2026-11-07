import type { CellStyle } from "@maxgraph/core";
import type { CanvasObject, ObjectKind } from "../document/types";

const shapes: Partial<Record<ObjectKind, string>> = {
  ellipse: "ellipse",
  diamond: "rhombus",
  database: "cylinder",
  person: "actor",
  cloud: "cloud",
};

export function objectStyle(item: CanvasObject): CellStyle {
  const base: CellStyle = {
    shape: shapes[item.kind] || "rectangle",
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
  if (item.kind === "sticky")
    Object.assign(base, {
      fillColor: "#fff0ad",
      strokeColor: "none",
      shadow: true,
      rounded: false,
      align: "left",
      verticalAlign: "top",
      fontSize: 16,
      spacing: 20,
    });
  if (item.kind === "text")
    Object.assign(base, { fillColor: "none", strokeColor: "none", fontSize: 22 });
  if (item.kind === "group")
    Object.assign(base, {
      fillColor: "#f3f0fc",
      fillOpacity: 35,
      strokeColor: "#a797cc",
      dashed: true,
      verticalAlign: "top",
      fontSize: 12,
      // A rotated frame would no longer contain its children; children rotate instead.
      rotatable: false,
    });
  if (item.kind === "connector")
    Object.assign(base, {
      shape: "connector",
      edgeStyle: "orthogonalEdgeStyle",
      rounded: true,
      endArrow: "block",
      strokeColor: "#7f8aa3",
      strokeWidth: 2,
      labelBackgroundColor: "#f7f8fc",
      whiteSpace: "nowrap",
      overflow: "visible",
    });
  if (item.kind === "stroke")
    Object.assign(base, {
      shape: "connector",
      edgeStyle: "none",
      endArrow: "none",
      startArrow: "none",
      strokeColor: "#6554c0",
      strokeWidth: 3,
      curved: true,
      // A drawing moves and transforms as one object, not as hundreds of waypoints.
      bendable: false,
    });
  return { ...base, ...item.style } as CellStyle;
}
