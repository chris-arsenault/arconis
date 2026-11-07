export type Optional<T> = T | undefined;
export type ObjectKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "service"
  | "database"
  | "cloud"
  | "person"
  | "sticky"
  | "text"
  | "group"
  | "connector"
  | "stroke";
export type StyleValue = string | number | boolean;
export interface CanvasObject {
  id: string;
  kind: ObjectKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: string;
  source: string;
  target: string;
  points: string;
  /** Stacking position; ties break by id so every peer draws the same order. */
  order: number;
  style: Record<string, StyleValue>;
}
export interface Bookmark {
  id: string;
  name: string;
  x: number;
  y: number;
  scale: number;
}
export const LOCAL = Symbol("local editor");
export const COLORS = ["#fff0ad", "#ffd9da", "#d9e9ff", "#d8efdf", "#e7dafa", "#ffffff"];
export const KIND_LABELS: Record<ObjectKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Decision",
  service: "Service",
  database: "Database",
  cloud: "Cloud",
  person: "Person",
  sticky: "Sticky note",
  text: "Text",
  group: "Group",
  connector: "Connector",
  stroke: "Drawing",
};
