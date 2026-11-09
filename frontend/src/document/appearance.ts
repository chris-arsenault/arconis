import type { Item, Look } from "./types";

/** Authored overrides, kept sparse so clearing a property restores its type's default. */
export function authoredLook(item: Item, named: Look = {}): Look {
  return { ...named, ...item.look };
}

type Defaulted =
  | "fill"
  | "line"
  | "lineWidth"
  | "textColor"
  | "textSize"
  | "font"
  | "align"
  | "valign"
  | "padding"
  | "lineHeight"
  | "paragraphGap"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "rotation"
  | "dashed"
  | "opacity"
  | "scale"
  | "path"
  | "arrow"
  | "startArrow";
export type Appearance = Look & Required<Pick<Look, Defaulted>>;

const BASE: Appearance = {
  fill: "#ffffff",
  line: "#9ca5b8",
  lineWidth: 1,
  textColor: "#283249",
  textSize: 14,
  font: "sans",
  align: "center",
  valign: "middle",
  padding: 8,
  lineHeight: 1.35,
  paragraphGap: 0.5,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  rotation: 0,
  dashed: false,
  opacity: 100,
  scale: 1,
  path: "cornered",
  arrow: "arrow",
  startArrow: "none",
};

const TYPES: Partial<Record<Item["type"], Look>> = {
  note: { fill: "#fff0ad", line: "none", align: "left", valign: "top", textSize: 16 },
  text: { fill: "none", line: "none", textSize: 22, padding: 4 },
  group: {
    fill: "#f3f0fc",
    opacity: 35,
    line: "#a797cc",
    dashed: true,
    valign: "top",
    textSize: 12,
  },
  frame: { fill: "#eef0f5", line: "#b9bfcd", textSize: 13, bold: true, padding: 4 },
  card: { align: "left" },
  band: { fill: "#e6f6f7", line: "none", valign: "top", textSize: 13 },
  line: { line: "#7f8aa3", lineWidth: 2 },
  drawing: { fill: "none", line: "#6554c0", lineWidth: 3, path: "curved", arrow: "none" },
  sketch: { fill: "none", line: "#b9bfcd", padding: 0 },
  highlight: { fill: "none", line: "#f5bc00", lineWidth: 4 },
  slide: {
    fill: "none",
    line: "#7863d4",
    valign: "bottom",
    align: "left",
    textSize: 12,
    bold: true,
    textColor: "#5443b3",
    padding: 4,
  },
  picture: { fill: "#eef0f5", line: "#d5daea", valign: "top", textSize: 12, padding: 2 },
};

const NODE_DEFAULTS: Record<string, Look> = {
  icon: { fill: "none", line: "none", valign: "top", padding: 2, textSize: 12 },
  junction: { fill: "#7f8aa3", line: "none" },
};

function typeDefaults(item: Item): Look {
  if (item.onLine) return { fill: "#7863d4", line: "#ffffff", padding: 0 };
  if (item.type === "node") return NODE_DEFAULTS[item.stencil] ?? {};
  if (item.type === "branch") return { ...TYPES.line, arrow: "none" };
  if (item.type === "reference")
    return { ...TYPES.line, path: "diagonal", arrow: "open", dashed: true, line: "#a797cc" };
  return TYPES[item.type] ?? {};
}

/** Effective semantic values are unscaled; adapters apply scale once at their output boundary. */
export function effectiveAppearance(item: Item, named: Look = {}): Appearance {
  const authored = authoredLook(item, named);
  let defaults = typeDefaults(item);
  if (item.type === "frame" && authored.title === "top")
    defaults = { ...defaults, fill: "none", align: "left", valign: "top", padding: 8 };
  const result = { ...BASE, ...defaults };
  for (const key of Object.keys(authored) as (keyof Look)[])
    if (authored[key] !== undefined) Object.assign(result, { [key]: authored[key] });
  return result;
}
