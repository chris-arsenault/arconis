import type { CanvasDocument } from "../document/canvasDocument";
import { movedWithContents } from "../document/relations";
import { layoutTree, type TreeLayoutOptions } from "../document/treeLayout";
import { LOCAL, isBox, type Item } from "../document/types";
import { DEFAULT_GAP } from "../document/layout";
import { slots } from "../document/arrangement";
import { footprint } from "../document/layout";
import type { CommandDefinition as Command, CommandContext } from "./registry";
import { layeredLayout } from "./graphLayout";

/** Layout as a verb: tidy a tree the way its root remembers, grid loose objects, layer a graph. */

/** Moves objects to new places, carrying what they hold, as one undo step. */
function applyMoves(document: CanvasDocument, moves: Map<string, { x: number; y: number }>) {
  const items = document.list();
  document.undo.stopCapturing();
  document.doc.transact(() => {
    moves.forEach(({ x, y }, id) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      movedWithContents(items, id, x - item.x, y - item.y).forEach(({ id: target, values }) =>
        document.patch(target, values)
      );
    });
  }, LOCAL);
  document.undo.stopCapturing();
}

/** Changes how a tree's root remembers to be tidied, and tidies it that way, as one undo step. */
export function tidyTreeAs(
  document: CanvasDocument,
  rootId: string,
  values: Partial<TreeLayoutOptions>
) {
  const root = document.get(rootId);
  if (!root) return;
  const tidy = { ...root.tidy, ...values };
  const items = document.list();
  const moves = layoutTree(items, rootId, tidy);
  document.undo.stopCapturing();
  document.doc.transact(() => {
    document.patch(rootId, { tidy });
    moves.forEach(({ x, y }, id) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      movedWithContents(items, id, x - item.x, y - item.y).forEach(
        ({ id: target, values: moved }) => document.patch(target, moved)
      );
    });
  }, LOCAL);
  document.undo.stopCapturing();
}

/** Loose objects into rows, as many across as fit a square, keeping their reading order. */
export function tidyGrid(document: CanvasDocument, ids: string[]) {
  const items = document.list();
  const chosen = new Set(ids);
  const boxes = items
    .filter(
      (item) => chosen.has(item.id) && isBox(item) && !item.onLine && !chosen.has(item.inside)
    )
    .sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
  if (boxes.length < 2) return;
  const spaces = boxes.map((box) => footprint(box));
  const columns = Math.ceil(Math.sqrt(boxes.length));
  const origin = { x: Math.min(...spaces.map((s) => s.x)), y: Math.min(...spaces.map((s) => s.y)) };
  const targets = slots(spaces, { how: "grid", columns, gap: DEFAULT_GAP / 2, align: "center" });
  const moves = new Map<string, { x: number; y: number }>();
  boxes.forEach((box, index) =>
    moves.set(box.id, {
      x: origin.x + targets[index].x + (box.x - spaces[index].x),
      y: origin.y + targets[index].y,
    })
  );
  applyMoves(document, moves);
}

const severalBoxes = ({ selected }: CommandContext) => selected.filter(isBox).length >= 2;

export const LAYOUT_COMMANDS: Command[] = [
  {
    id: "arrange.grid",
    label: "Tidy into a grid",
    help: "Lay the selected loose objects out in rows, keeping their reading order.",
    group: "arrange",
    keywords: ["rows", "layout", "notes"],
    when: severalBoxes,
    run: ({ editor, selected }) =>
      tidyGrid(
        editor.document,
        selected.map((item: Item) => item.id)
      ),
  },
  {
    id: "arrange.layered",
    label: "Lay out as a flow",
    help: "Rank the selected objects left to right along the lines between them.",
    group: "arrange",
    keywords: ["layered", "graph", "diagram", "left to right", "dagre"],
    when: severalBoxes,
    run: ({ editor, selected }) =>
      applyMoves(
        editor.document,
        layeredLayout(
          editor.document.list(),
          selected.map((item) => item.id)
        )
      ),
  },
];
