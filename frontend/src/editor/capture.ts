import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { layoutTree } from "../document/treeLayout";
import { movedWithContents } from "../document/relations";
import { creationSize, creationValues } from "./zoom";

/** Room between captured notes as they stack. */
const STACK_GAP = 12;

/** Where captured notes stack from, and the notes captured so far, for this run of capture. */
export interface Capture {
  at: { x: number; y: number };
  ids: string[];
}

/** Adds the next captured note beneath the last, and returns its id. */
export function captureNote(
  document: CanvasDocument,
  capture: Capture,
  text: string,
  scale: number
) {
  const size = creationSize("note", scale);
  const last = capture.ids
    .map((id) => document.get(id))
    .filter((item) => item !== null)
    .at(-1);
  const y = last ? last.y + last.height + STACK_GAP / scale : capture.at.y;
  return document.create("note", capture.at.x, y, {
    name: text,
    ...size,
    ...creationValues("note", scale),
  });
}

/** Turns the captured stack into a tree: the first note heads the rest, laid out to the right. */
export function captureToTree(document: CanvasDocument, ids: string[]) {
  const [rootId, ...rest] = ids.filter((id) => document.get(id));
  if (!rootId || !rest.length) return rootId ?? "";
  document.undo.stopCapturing();
  document.doc.transact(() => {
    for (const id of rest)
      document.insert(
        document.build("branch", 0, 0, {
          from: rootId,
          to: id,
          fromPort: [1, 0.5],
          toPort: [0, 0.5],
        })
      );
    const items = document.list();
    layoutTree(items, rootId, { direction: "right", compact: false, sorted: false }).forEach(
      ({ x, y }, id) => {
        const item = items.find((candidate) => candidate.id === id)!;
        movedWithContents(items, id, x - item.x, y - item.y).forEach(({ id: target, values }) =>
          document.patch(target, values)
        );
      }
    );
  }, LOCAL);
  document.undo.stopCapturing();
  return rootId;
}
