import { branchChildren, branchParent } from "../document/relations";
import { isBox } from "../document/types";
import type { EditorController } from "./controller";
import type { CommandDefinition as Command, CommandContext } from "./registry";

import { gridForScale } from "./zoom";
import {
  connectedClone,
  deleteKeepingChildren,
  insertParent,
  promote,
  reorderSibling,
  showLevels,
} from "./treeEdits";
import { neighbour, type Direction } from "./walking";
import { addBranch } from "./topics";
import { slidesFromBranches } from "./slidesFromTree";
import { startCapture } from "./ui";
import { pastePoint } from "./clipboard";

/** Keyboard editing and walking of trees and diagrams, as commands with one meaning each. */

const one = ({ selected }: CommandContext) => selected.length === 1 && isBox(selected[0]);
const inTree = ({ selected, items }: CommandContext) =>
  one({ selected, items } as CommandContext) &&
  (branchParent(items, selected[0].id) !== "" || branchChildren(items, selected[0].id).length > 0);
const DIRECTIONS: { direction: Direction; key: string; label: string }[] = [
  { direction: "left", key: "arrowleft", label: "left" },
  { direction: "right", key: "arrowright", label: "right" },
  { direction: "up", key: "arrowup", label: "up" },
  { direction: "down", key: "arrowdown", label: "down" },
];
const STEPS: Record<Direction, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};
/** How many grid steps Shift adds to a nudge. */
const BIG_NUDGE = 10;

/** Moves the selection by whole grid steps, carrying branches and contents as a drag would. */
function nudge(editor: EditorController, direction: Direction, big: boolean) {
  const model = editor.graph.getDataModel();
  const cells = editor
    .selected()
    .filter((item) => !item.locked)
    .map((item) => model.getCell(item.id))
    .filter((cell) => cell !== null);
  if (!cells.length) return;
  const unit = gridForScale(editor.graph.view.scale) * (big ? BIG_NUDGE : 1);
  const [dx, dy] = STEPS[direction];
  editor.graph.moveCells(cells, dx * unit, dy * unit);
}

/** Splits the topic being edited at the caret: the rest of its text becomes a new sibling. */
export function splitAtCaret(editor: EditorController, id: string, element: HTMLTextAreaElement) {
  const { selectionStart, value } = element;
  const rest = value.slice(selectionStart).trim();
  const kept = value.slice(0, selectionStart).trimEnd();
  if (!rest) return addBranch(editor, true);
  editor.document.editText(id, kept);
  const sibling = addBranch(editor, true);
  if (sibling) editor.document.editText(sibling, rest);
  return sibling;
}

export const STRUCTURE_KEYS: Command[] = [
  ...DIRECTIONS.map(({ direction, key, label }): Command => ({
    id: `select.${direction}`,
    label: `Select ${label}`,
    help: "Move the selection to the neighbouring object that way, walking the tree when in one.",
    group: "select",
    shortcuts: [{ key }],
    keywords: ["walk", "arrow", "neighbour"],
    when: one,
    run: ({ editor, items, selected }) => {
      const next = neighbour(items, selected[0], direction);
      if (next) editor.select(next.id);
    },
  })),
  ...DIRECTIONS.map(({ direction, key, label }): Command => ({
    id: `arrange.nudge.${direction}`,
    label: `Nudge ${label}`,
    help: "Move the selection one grid step, carrying its contents and branches as a drag would.",
    group: "arrange",
    shortcuts: [{ key, ctrl: true }],
    keywords: ["move by grid"],
    when: ({ selected }) => selected.some((item) => !item.locked),
    run: ({ editor }) => nudge(editor, direction, false),
  })),
  ...DIRECTIONS.map(({ direction, key, label }): Command => ({
    id: `arrange.nudgeFar.${direction}`,
    label: `Nudge ${label} by ten`,
    help: "Move the selection ten grid steps, carrying its contents and branches as a drag would.",
    group: "arrange",
    shortcuts: [{ key, ctrl: true, shift: true }],
    when: ({ selected }) => selected.some((item) => !item.locked),
    run: ({ editor }) => nudge(editor, direction, true),
  })),
  ...DIRECTIONS.map(({ direction, key, label }): Command => ({
    id: `structure.clone.${direction}`,
    label: `Connected copy ${label}`,
    help: "Place a copy one gap away that way, joined to the original, and start typing in it.",
    group: "structure",
    shortcuts: [{ key, ctrl: true, alt: true }],
    keywords: ["duplicate and connect", "grow"],
    when: one,
    run: ({ editor, selected }) => {
      const id = connectedClone(editor.document, selected[0].id, direction);
      if (id) {
        editor.select(id);
        editor.edit(id, true);
      }
    },
  })),
  {
    id: "structure.earlier",
    label: "Move earlier among siblings",
    help: "Swap this topic and its subtree with the sibling before it.",
    group: "structure",
    shortcuts: [{ key: "arrowup", alt: true }],
    keywords: ["reorder", "swap"],
    when: one,
    run: ({ editor, selected }) => reorderSibling(editor.document, selected[0].id, -1),
  },
  {
    id: "structure.later",
    label: "Move later among siblings",
    help: "Swap this topic and its subtree with the sibling after it.",
    group: "structure",
    shortcuts: [{ key: "arrowdown", alt: true }],
    keywords: ["reorder", "swap"],
    when: one,
    run: ({ editor, selected }) => reorderSibling(editor.document, selected[0].id, 1),
  },
  {
    id: "structure.promote",
    label: "Promote to the parent's level",
    help: "Move this topic up to branch from its grandparent, keeping its place on the canvas.",
    group: "structure",
    shortcuts: [{ key: "tab", shift: true }],
    keywords: ["outdent", "grandparent"],
    when: ({ selected, items }) =>
      selected.length === 1 && branchParent(items, branchParent(items, selected[0].id)) !== "",
    run: ({ editor, selected }) => promote(editor.document, selected[0].id),
  },
  {
    id: "structure.insertParent",
    label: "Insert a parent topic",
    help: "Put a new topic between this one and its parent, and start typing in it.",
    group: "structure",
    keywords: ["wrap", "above"],
    when: one,
    run: ({ editor, selected }) => {
      const id = insertParent(editor.document, selected[0].id);
      if (id) {
        editor.select(id);
        editor.edit(id, true);
      }
    },
  },
  {
    id: "structure.deleteKeeping",
    label: "Delete, keeping branches and contents",
    help: "Remove this object, handing its branches to its parent and its contents to its holder.",
    group: "structure",
    shortcuts: [
      { key: "delete", ctrl: true },
      { key: "backspace", ctrl: true },
    ],
    keywords: ["remove topic", "unwrap"],
    when: ({ selected }) => selected.length === 1 && !selected[0].locked,
    run: ({ editor, selected }) => deleteKeepingChildren(editor.document, selected[0].id),
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((levels): Command => ({
    id: `structure.levels.${levels}`,
    label: `Show ${levels} ${levels === 1 ? "level" : "levels"} of the tree`,
    help: "Fold the selected tree's topics below that depth and unfold the ones above it.",
    group: "structure",
    shortcuts: [{ key: String(levels) }],
    keywords: ["fold", "collapse", "depth"],
    when: inTree,
    run: ({ editor, selected }) => showLevels(editor.document, selected[0].id, levels),
  })),
  {
    id: "structure.slides",
    label: "Slides from branches",
    help: "Make a deck with a slide over the whole tree, then one over each main branch.",
    group: "structure",
    keywords: ["deck", "present", "one per branch"],
    when: inTree,
    run: ({ editor, selected }) => {
      const ids = slidesFromBranches(editor.document, selected[0].id);
      if (ids.length) editor.select(ids[0]);
    },
  },
  {
    id: "create.capture",
    label: "Capture notes",
    help: "Open a box where each Enter drops a new note under the last one.",
    group: "create",
    shortcuts: [{ key: "n", shift: true }],
    keywords: ["brainstorm", "quick entry", "stack"],
    when: ({ editor }) => editor.ui.capture === null,
    run: ({ editor }) => startCapture(editor, pastePoint(editor)),
  },
  {
    id: "view.focus",
    label: ({ editor }) => (editor.focus ? "Leave focus" : "Focus on the selection"),
    help: "Dim or restore everything outside the selection's tree, contents and references, in your view only.",
    group: "view",
    shortcuts: [{ key: "." }],
    keywords: ["dim", "spotlight", "subtree"],
    when: ({ editor, selected }) => editor.focus !== null || selected.length === 1,
    run: ({ editor, selected }) => editor.setFocus(editor.focus ? null : selected[0].id),
  },
];
