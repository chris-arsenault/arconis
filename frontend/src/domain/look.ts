import type { StyleValue } from "../document/types";

/** How an item looks, in the words a person would use rather than the renderer's keys. */
export interface Look {
  fill?: string;
  line?: string;
  lineWidth?: number;
  textColor?: string;
  textSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  rotation?: number;
  iconColor?: string;
  dashed?: boolean;
}

export type Route = "orthogonal" | "elbow" | "straight";
export type Arrow = "arrow" | "open" | "none";

/** Each look property and the style key that stores it. Bold and italic share `fontStyle`. */
const SIMPLE_KEYS = {
  fill: "fillColor",
  line: "strokeColor",
  lineWidth: "strokeWidth",
  textColor: "fontColor",
  textSize: "fontSize",
  align: "align",
  rotation: "rotation",
  iconColor: "iconColor",
  dashed: "dashed",
} as const satisfies Partial<Record<keyof Look, string>>;
const BOLD = 1;
const ITALIC = 2;
const ROUTES: Record<Route, string> = {
  orthogonal: "orthogonalEdgeStyle",
  elbow: "elbowEdgeStyle",
  straight: "none",
};
const ARROWS: Record<Arrow, string> = { arrow: "block", open: "open", none: "none" };

/**
 * Keys with a meaning of their own elsewhere in the model, so they never appear as look or as
 * opaque settings.
 */
export const MODEL_KEYS = new Set([
  "relation",
  "lineAnchor",
  "icon",
  "pictureHash",
  "pictureType",
  "pictureStored",
  "edgeStyle",
  "endArrow",
  "exitX",
  "exitY",
  "entryX",
  "entryY",
  "fontStyle",
  ...Object.values(SIMPLE_KEYS),
]);

export function readLook(style: Record<string, StyleValue>) {
  const look: Record<string, unknown> = {};
  for (const [name, key] of Object.entries(SIMPLE_KEYS)) if (key in style) look[name] = style[key];
  const fontStyle = Number(style.fontStyle || 0);
  if (fontStyle & BOLD) look.bold = true;
  if (fontStyle & ITALIC) look.italic = true;
  return look as Look;
}

export function writeLook(look: Look, current: Record<string, StyleValue> = {}) {
  const style: Record<string, StyleValue> = {};
  for (const [name, key] of Object.entries(SIMPLE_KEYS)) {
    const value = look[name as keyof Look];
    if (value !== undefined) style[key] = value;
  }
  if (look.bold !== undefined || look.italic !== undefined)
    style.fontStyle = fontStyleOf(look, Number(current.fontStyle || 0));
  return style;
}

/** Bold and italic are bits of one stored value, so each changes only its own bit. */
function fontStyleOf(look: Look, current: number) {
  const set = (value: number, bit: number, on: boolean | undefined) => {
    if (on === undefined) return value;
    return on ? value | bit : value & ~bit;
  };
  return set(set(current, BOLD, look.bold), ITALIC, look.italic);
}

/** Settings the editor keeps that have no domain meaning, carried along so nothing is lost. */
export function readExtra(style: Record<string, StyleValue>) {
  const extra = Object.fromEntries(Object.entries(style).filter(([key]) => !MODEL_KEYS.has(key)));
  return Object.keys(extra).length ? extra : undefined;
}

export function readRoute(style: Record<string, StyleValue>): Route {
  const value = style.edgeStyle ?? ROUTES.orthogonal;
  return (Object.keys(ROUTES) as Route[]).find((route) => ROUTES[route] === value) ?? "orthogonal";
}
export function readArrow(style: Record<string, StyleValue>, fallback: Arrow = "arrow"): Arrow {
  if (!("endArrow" in style)) return fallback;
  return (
    (Object.keys(ARROWS) as Arrow[]).find((arrow) => ARROWS[arrow] === style.endArrow) ?? fallback
  );
}
export function routeStyle(route: Route) {
  return ROUTES[route];
}
export function arrowStyle(arrow: Arrow) {
  return ARROWS[arrow];
}
export const ROUTE_NAMES = Object.keys(ROUTES) as Route[];
export const ARROW_NAMES = Object.keys(ARROWS) as Arrow[];
