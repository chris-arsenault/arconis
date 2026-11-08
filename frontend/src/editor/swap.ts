import type { CanvasDocument } from "../document/canvasDocument";
import { movedWithContents, worldBounds } from "../document/relations";
import { paddingOf } from "../document/layout";
import { authoredLook } from "../document/appearance";
import {
  LOCAL,
  STENCILS,
  isBox,
  isFrame,
  isLink,
  type Item,
  type Stencil,
} from "../document/types";

/**
 * Changing what an object is while it stays where it is: a note becomes a rectangle, a rectangle
 * a diamond, keeping its id, geometry, text, contents, fields and connectors. Also swapping two
 * objects' places and the verbs a line or a frame takes.
 */

/** What an object can become: a node of a stencil, or another box type that carries text. */
export type Kind = Stencil | "note" | "text" | "card";
export const KINDS: Kind[] = [
  ...STENCILS.filter((s) => s !== "junction" && s !== "icon"),
  "note",
  "text",
  "card",
];

export function kindOf(item: Item): Kind | null {
  if (item.type === "node") return item.stencil;
  if (item.type === "note" || item.type === "text" || item.type === "card") return item.type;
  return null;
}

function step(document: CanvasDocument, work: () => void) {
  document.undo.stopCapturing();
  document.doc.transact(work, LOCAL);
  document.undo.stopCapturing();
}

/** Makes each object the kind, where it is one that can change; lines and frames stay as they are. */
export function changeKind(document: CanvasDocument, ids: string[], kind: Kind) {
  const items = ids
    .map((id) => document.get(id))
    .filter((item) => item !== null && kindOf(item) !== null);
  if (!items.length) return;
  const isStencil = (STENCILS as readonly string[]).includes(kind);
  step(document, () => {
    for (const item of items)
      document.patch(item!.id, {
        type: isStencil ? "node" : (kind as Item["type"]),
        stencil: isStencil ? (kind as Stencil) : "rectangle",
      });
  });
}

/** Exchanges two objects' places, each with what it holds; their lines follow their ends. */
export function swapPositions(document: CanvasDocument, first: string, second: string) {
  const items = document.list();
  const a = items.find((item) => item.id === first);
  const b = items.find((item) => item.id === second);
  if (!a || !b || !isBox(a) || !isBox(b)) return false;
  const centre = (item: Item) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
  const ca = centre(a);
  const cb = centre(b);
  step(document, () => {
    const moves = [
      ...movedWithContents(items, a.id, cb.x - ca.x, cb.y - ca.y),
      ...movedWithContents(items, b.id, ca.x - cb.x, ca.y - cb.y),
    ];
    moves.forEach(({ id, values }) => document.patch(id, values));
  });
  return true;
}

/** Turns a line around: its ends, ports and arrowheads trade places. */
export function reverseLine(document: CanvasDocument, id: string) {
  const line = document.get(id);
  if (!line || !isLink(line)) return false;
  step(document, () => {
    document.patch(id, {
      from: line.to,
      to: line.from,
      fromPort: line.toPort,
      toPort: line.fromPort,
    });
    const { arrow, startArrow } = line.look;
    document.patchLook(id, { arrow: startArrow ?? "none", startArrow: arrow ?? "arrow" });
  });
  return true;
}

/** Forgets a line's bend points and its label's place, so it routes itself again. */
export function clearWaypoints(document: CanvasDocument, id: string) {
  const line = document.get(id);
  if (!line || !isLink(line)) return false;
  step(document, () => document.patch(id, { points: [], x: 0, y: 0 }));
  return true;
}

/** Sizes a frame snugly around what it holds, keeping its padding and title room. */
export function fitFrameToContents(document: CanvasDocument, id: string) {
  const items = document.list();
  const frame = items.find((item) => item.id === id);
  if (!frame || !isFrame(frame)) return false;
  const held = items.filter((item) => item.inside === id && isBox(item) && item.type !== "band");
  const contents = worldBounds(held);
  if (!contents) return false;
  const padding = paddingOf(frame, authoredLook(frame, document.namedStyle(frame.style)));
  step(document, () =>
    document.patch(id, {
      x: contents.x - padding.left,
      y: contents.y - padding.top,
      width: contents.width + padding.left + padding.right,
      height: contents.height + padding.top + padding.bottom,
    })
  );
  return true;
}
