import type { ItemType, Look, PathPoint, Port } from "../document/types";

/** The statements of the canvas language, as parsed. */

export type Direction = "below" | "above" | "left of" | "right of";
export type Edge = "top" | "middle" | "bottom" | "left" | "center" | "right";
export type Arrangement = "row" | "column" | "grid";

export type Attribute =
  | { kind: "word"; word: string }
  | { kind: "look"; look: Look; cleared: (keyof Look)[] }
  | { kind: "icon"; icon: string }
  | { kind: "at"; x: number; y: number }
  | { kind: "size"; width?: number; height?: number }
  | { kind: "by"; dx: number; dy: number }
  | { kind: "beside"; direction: Direction; ref: string; gap?: number }
  | { kind: "align"; edge: Edge; ref: string }
  | { kind: "match"; dimension: "width" | "height"; ref: string }
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "in"; ref: string }
  | { kind: "over"; refs: string[] }
  | { kind: "on"; ref: string }
  | { kind: "arrange"; how: Arrangement; columns?: number; gap?: number; align?: Edge }
  | { kind: "picture"; hash: string; format: string; stored: boolean }
  | { kind: "points"; points: PathPoint[] }
  | { kind: "via"; points: PathPoint[] }
  | { kind: "label"; x: number; y: number }
  | { kind: "deck"; deck: string; slide?: number }
  | { kind: "free" };

export interface Located {
  line: number;
}

export interface ItemStatement extends Located {
  kind: "item";
  type: ItemType;
  id?: string;
  name?: string;
  subtitle?: string;
  attributes: Attribute[];
  body?: Statement[];
}
/** An existing item named on its own: `edit a ...`, or a bare id inside a block. */
export interface EditStatement extends Located {
  kind: "edit";
  ref: string;
  name?: string;
  subtitle?: string;
  attributes: Attribute[];
  body?: Statement[];
}
export interface ArrangeStatement extends Located {
  kind: "arrange";
  id?: string;
  how: Arrangement;
  columns?: number;
  attributes: Attribute[];
  body: Statement[];
}

export type LinkType = "line" | "branch" | "reference";
export interface Endpoint {
  ref?: string;
  item?: ItemStatement;
  port?: Port;
}
export interface Segment {
  from: Endpoint;
  to: Endpoint;
  type: LinkType;
  arrow: boolean;
  /** An arrow at the start too, from `<->`. */
  both?: boolean;
  label?: string;
}
export interface LinkStatement extends Located {
  kind: "link";
  segments: Segment[];
  id?: string;
  attributes: Attribute[];
}

export interface CommentText {
  id?: string;
  author: string;
  time: number;
  text: string;
}

export type Statement =
  | ItemStatement
  | EditStatement
  | ArrangeStatement
  | LinkStatement
  | ({ kind: "header"; version: number } & Located)
  | ({ kind: "title"; title: string } & Located)
  | ({ kind: "style"; name: string; attributes: Attribute[] } & Located)
  | ({ kind: "delete"; refs: string[] } & Located)
  | ({
      kind: "view";
      id?: string;
      name: string;
      center: { x: number; y: number };
      zoom: number;
    } & Located)
  | ({
      kind: "discussion";
      on: string;
      resolved: boolean;
      comments: CommentText[];
    } & Located)
  | ({ kind: "comment"; on: string; text: string } & Located)
  | ({ kind: "reply"; to: string; text: string } & Located)
  | ({ kind: "resolve"; id: string; resolved: boolean } & Located)
  | ({ kind: "tidy"; ref: string } & Located)
  | ({ kind: "data"; hash: string; format: string; data: string } & Located);

/** Ports by name, as fractions of an item's box. */
export const SIDES: Record<string, Port> = {
  top: [0.5, 0],
  bottom: [0.5, 1],
  left: [0, 0.5],
  right: [1, 0.5],
  "top-left": [0, 0],
  "top-right": [1, 0],
  "bottom-left": [0, 1],
  "bottom-right": [1, 1],
};

/** The language's word for each look property that takes a value. */
export const LOOK_WORDS = {
  fill: "fill",
  line: "line",
  "line-width": "lineWidth",
  "text-color": "textColor",
  "text-size": "textSize",
  font: "font",
  valign: "valign",
  "text-highlight": "textHighlight",
  "line-height": "lineHeight",
  "paragraph-gap": "paragraphGap",
  padding: "padding",
  "text-fit": "textFit",
  align: "align",
  rotate: "rotation",
  opacity: "opacity",
  "icon-color": "iconColor",
  badge: "badge",
  title: "title",
  path: "path",
  arrow: "arrow",
  "start-arrow": "startArrow",
  scale: "scale",
} as const satisfies Record<string, keyof Look>;
/** Look properties that are on or off: the word alone turns one on, `off` turns it off. */
export const LOOK_FLAGS = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strike: "strike",
  dashed: "dashed",
  vertical: "vertical",
} as const satisfies Record<string, keyof Look>;
