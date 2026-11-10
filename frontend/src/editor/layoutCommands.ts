import type { CanvasDocument } from "../document/canvasDocument";
import { branchChildren, movedWithContents } from "../document/relations";
import { balancedSides, layoutTree, type TreeLayoutOptions } from "../document/treeLayout";
import { LOCAL, isBox, type Item } from "../document/types";
import { DEFAULT_GAP } from "../document/layout";
import { slots } from "../document/arrangement";
import { footprint } from "../document/layout";
import type { Command, CommandContext } from "./registry";
import { layeredLayout } from "./graphLayout";

/** Layout as a verb: tidy a tree a chosen way, balance it, grid loose objects, layer a graph. */

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

export function tidyTree(document: CanvasDocument, rootId: string, options: TreeLayoutOptions) {
  applyMoves(document, layoutTree(document.list(), rootId, options));
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
  const targets = slots(spaces, { how: "grid", columns, gap: DEFAULT_GAP / 2 });
  const moves = new Map<string, { x: number; y: number }>();
  boxes.forEach((box, index) =>
    moves.set(box.id, {
      x: origin.x + targets[index].x + (box.x - spaces[index].x),
      y: origin.y + targets[index].y,
    })
  );
  applyMoves(document, moves);
}

const heads = ({ selected, items }: CommandContext) =>
  selected.length === 1 && branchChildren(items, selected[0].id).length > 0;
const severalBoxes = ({ selected }: CommandContext) => selected.filter(isBox).length >= 2;

const TIDIES: {
  id: string;
  label: string;
  help: string;
  options: TreeLayoutOptions;
  keywords: string[];
}[] = [
  {
    id: "structure.tidyRight",
    label: "Tidy branches to the right",
    help: "Lay out the selected tree with every branch growing right of its root.",
    options: { direction: "right", compact: false, sorted: false },
    keywords: ["layout", "tree"],
  },
  {
    id: "structure.tidyLeft",
    label: "Tidy branches to the left",
    help: "Lay out the selected tree with every branch growing left of its root.",
    options: { direction: "left", compact: false, sorted: false },
    keywords: ["layout", "tree"],
  },
  {
    id: "structure.tidyDown",
    label: "Tidy branches downward",
    help: "Lay out the selected tree top-down, like an org chart.",
    options: { direction: "down", compact: false, sorted: false },
    keywords: ["layout", "tree", "org chart", "top-down"],
  },
  {
    id: "structure.tidyCompact",
    label: "Tidy branches compactly",
    help: "Lay out the selected tree on both sides with tighter gaps between branches.",
    options: { direction: "sides", compact: true, sorted: false },
    keywords: ["layout", "tree", "dense"],
  },
  {
    id: "structure.sort",
    label: "Sort branches by name",
    help: "Lay out the selected tree with its branches in alphabetical order.",
    options: { direction: "sides", compact: false, sorted: true },
    keywords: ["alphabetical", "order"],
  },
];

export const LAYOUT_COMMANDS: Command[] = [
  ...TIDIES.map(({ id, label, help, options, keywords }): Command => ({
    id,
    label,
    help,
    group: "structure",
    keywords,
    when: heads,
    run: ({ editor, selected }) => tidyTree(editor.document, selected[0].id, options),
  })),
  {
    id: "structure.balance",
    label: "Balance branches on both sides",
    help: "Alternate the root's branches between its two sides, then tidy the tree.",
    group: "structure",
    keywords: ["layout", "tree", "mind map"],
    when: heads,
    run: ({ editor, selected }) => {
      applyMoves(editor.document, balancedSides(editor.document.list(), selected[0].id));
      tidyTree(editor.document, selected[0].id, {
        direction: "sides",
        compact: false,
        sorted: false,
      });
    },
  },
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
