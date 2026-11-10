import type {
  Flag,
  FlowArrangement,
  InkKind,
  ItemType,
  Look,
  Marker,
  PathPoint,
  Port,
  TaskState,
} from "../document/types";
import type { TreeDirection } from "../document/treeLayout";
import type { Calibration } from "../document/units";

/**
 * Attribute words that may also be ids in documents written before the words existed. A quoted name
 * after such an id tells it apart from the attribute, and canonical files write one.
 */
export const DRAWING_WORDS = new Set([
  "ink",
  "target",
  "markup",
  "workspace",
  "locked",
  "hidden",
  "collapsed",
  "numbered",
  "tags",
  "marker",
  "task",
  "link",
  "edited",
  "property",
  "in-layer",
  "scale-contents",
]);

/** The statements of the canvas language, as parsed. */

export type Direction = "below" | "above" | "left of" | "right of";
export type Edge = "top" | "middle" | "bottom" | "left" | "center" | "right";
export type Arrangement = "row" | "column" | "grid";
/** An omitted edit preserves the existing value; an explicit empty string clears it. */
export type TextEdit = { kind: "keep" } | { kind: "set"; value: string };
export type RequestedId = { kind: "automatic" } | { kind: "named"; id: string };
export const AUTOMATIC: RequestedId = { kind: "automatic" };
export const KEEP_TEXT: TextEdit = { kind: "keep" };
export type Block = { kind: "none" } | { kind: "block"; statements: Statement[] };
export const NO_BLOCK: Block = { kind: "none" };
export function requestedId(identity: RequestedId) {
  return identity.kind === "named" ? identity.id : "";
}

export type Attribute =
  | { kind: "word"; word: string }
  | { kind: "look"; look: Look; cleared: (keyof Look)[] }
  | { kind: "icon"; icon: string }
  | { kind: "at"; x: number; y: number }
  | {
      kind: "size";
      dimensions:
        | { kind: "both"; width: number; height: number }
        | { kind: "width" | "height"; value: number };
    }
  | { kind: "by"; dx: number; dy: number }
  | { kind: "beside"; direction: Direction; ref: string; gap: number }
  | { kind: "align"; edge: Edge; ref: string }
  | { kind: "match"; dimension: "width" | "height"; ref: string }
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "in"; ref: string }
  | { kind: "over"; refs: string[] }
  | { kind: "on"; ref: string }
  | ({ kind: "arrange" } & FlowArrangement)
  | { kind: "picture"; hash: string; format: string; stored: boolean }
  | { kind: "points"; points: PathPoint[] }
  | { kind: "via"; points: PathPoint[] }
  | { kind: "label"; x: number; y: number }
  | { kind: "deck"; deck: string; numbering: { kind: "next" } | { kind: "number"; value: number } }
  | { kind: "free" }
  | { kind: "markup"; value: boolean }
  | { kind: "scaleContents"; value: boolean }
  | { kind: "ink"; ink: InkKind }
  | { kind: "target"; ref: string }
  | { kind: "flag"; flag: Flag; value: boolean }
  /** An empty list clears the tags. */
  | { kind: "tags"; tags: string[] }
  | { kind: "marker"; marker: Marker | "none" }
  | { kind: "task"; task: TaskState | "none" }
  | { kind: "link"; link: string }
  | { kind: "edited"; by: string; at: number }
  /** The content layer a top-level item or line is in. */
  | { kind: "layer"; ref: string }
  /** A property's value, or none to remove it. */
  | { kind: "property"; key: string; edit: { kind: "remove" } | { kind: "set"; value: string } };

export interface Located {
  line: number;
}

export interface ItemStatement extends Located {
  kind: "item";
  type: ItemType;
  identity: RequestedId;
  name: TextEdit;
  subtitle: TextEdit;
  attributes: Attribute[];
  body: Block;
}
/** An existing item named on its own: `edit a ...`, or a bare id inside a block. */
export interface EditStatement extends Located {
  kind: "edit";
  ref: string;
  name: TextEdit;
  subtitle: TextEdit;
  attributes: Attribute[];
  body: Block;
}
export interface ArrangeStatement extends Located {
  kind: "arrange";
  identity: RequestedId;
  how: Arrangement;
  attributes: Attribute[];
  body: Statement[];
}

export type LinkType = "line" | "branch" | "reference";
export type Endpoint = (
  { kind: "reference"; ref: string } | { kind: "item"; item: ItemStatement }
) & { port: Port | null };
export interface Segment {
  from: Endpoint;
  to: Endpoint;
  type: LinkType;
  arrow: boolean;
  /** An arrow at the start too, from `<->`. */
  both: boolean;
  label: TextEdit;
}
export interface LinkStatement extends Located {
  kind: "link";
  segments: Segment[];
  identity: RequestedId;
  attributes: Attribute[];
}

export interface CommentText {
  identity: RequestedId;
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
  | ({ kind: "scale"; calibration: Calibration | null } & Located)
  | ({ kind: "style"; name: string; attributes: Attribute[] } & Located)
  | ({ kind: "delete"; refs: string[] } & Located)
  | ({
      kind: "view";
      identity: RequestedId;
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
  | ({
      kind: "tidy";
      ref: string;
      direction: TreeDirection;
      compact: boolean;
      sorted: boolean;
    } & Located)
  | ({ kind: "data"; hash: string; format: string; data: string } & Located)
  | ({
      kind: "layer";
      id: string;
      name: TextEdit;
      place: { relation: "above" | "below"; ref: string } | { relation: "keep" };
    } & Located)
  | ({ kind: "merge"; from: string; into: string } & Located)
  | ({ kind: "dropLayer"; id: string } & Located);

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
