import { MARKERS, type Item } from "../document/types";
import { holdsOthers } from "../document/relations";
import type { CommandDefinition as Command, CommandContext } from "./registry";
import { showFilter, showTagger } from "./ui";
import { changeFields } from "./commands";
import { MARKER_LABELS } from "./markerLabels";

export { MARKER_LABELS } from "./markerLabels";

/** Commands over the fields every item carries: lock, collapse and task state. */

const some = ({ selected }: CommandContext) => selected.length > 0;
const ids = ({ selected }: CommandContext) => selected.map((item) => item.id);

/** Toggling a task walks it from nothing to open, to done, and back to nothing. */
const NEXT_TASK: Record<"none" | "open" | "done", Item["task"]> = {
  none: "open",
  open: "done",
  done: "none",
};

function taskLabel({ selected }: CommandContext) {
  const [item] = selected;
  if (!item || item.task === "none") return "Make a task";
  return item.task === "open" ? "Mark done" : "Clear task";
}

export const FIELD_COMMANDS: Command[] = [
  {
    id: "view.filter",
    label: ({ editor }) =>
      editor.ui.filter ? "Close the filter" : "Filter by tag, marker, task or editor",
    help: "Open or close the bar that dims everything but matching objects, in your view only.",
    group: "view",
    shortcuts: [{ key: "f", ctrl: true, shift: true }],
    keywords: ["dim", "tags", "markers", "tasks", "author"],
    run: ({ editor }) => showFilter(editor, !editor.ui.filter),
  },
  {
    id: "fields.lock",
    label: ({ selected }) => (selected.every((item) => item.locked) ? "Unlock" : "Lock"),
    help: "Lock or release the selection against moving, resizing, editing and deleting, for everyone.",
    group: "fields",
    shortcuts: [{ key: "l", ctrl: true, shift: true }],
    when: some,
    run: (context) => {
      const locked = context.selected.every((item) => item.locked);
      changeFields(context.editor.document, ids(context), { locked: !locked });
    },
  },
  {
    id: "fields.jump",
    label: ({ selected }) =>
      selected.every((item) => item.jump) ? "Remove jump point" : "Mark as jump point",
    help: "List the selection under Jump points in Navigate, so anyone in the room can fly to it.",
    group: "fields",
    keywords: ["bookmark", "place", "landmark"],
    when: some,
    run: (context) => {
      const jump = context.selected.every((item) => item.jump);
      changeFields(context.editor.document, ids(context), { jump: !jump });
    },
  },
  {
    id: "fields.unlockAll",
    label: ({ items }) => `Unlock all (${items.filter((item) => item.locked).length})`,
    help: "Release every locked object on the canvas at once.",
    group: "fields",
    when: ({ items }) => items.some((item) => item.locked),
    run: ({ editor, items }) =>
      changeFields(
        editor.document,
        items.filter((item) => item.locked).map((item) => item.id),
        { locked: false }
      ),
  },
  {
    id: "fields.collapse",
    label: ({ selected }) => (selected.every((item) => item.collapsed) ? "Expand" : "Collapse"),
    help: "Fold away or bring back what the selection holds or heads; everyone sees the same fold.",
    group: "fields",
    shortcuts: [{ key: ".", ctrl: true }],
    keywords: ["fold", "unfold"],
    when: ({ selected, items }) =>
      selected.length > 0 && selected.some((item) => item.collapsed || holdsOthers(items, item.id)),
    run: (context) => {
      const collapsed = context.selected.every((item) => item.collapsed);
      changeFields(context.editor.document, ids(context), {
        collapsed: !collapsed,
      });
    },
  },
  {
    id: "fields.tag",
    label: "Tag…",
    help: "Open the tag editor above the selection to add or remove tags.",
    group: "fields",
    keywords: ["tags", "label", "category", "hashtag"],
    when: some,
    run: ({ editor }) => showTagger(editor, true),
  },
  ...MARKERS.map((marker): Command => ({
    id: `fields.marker.${marker}`,
    label: MARKER_LABELS[marker],
    help: "Badge the selection with this shape, replacing any marker it had.",
    group: "fields",
    keywords: ["marker", "badge", "shape"],
    when: some,
    run: (context) => changeFields(context.editor.document, ids(context), { marker }),
  })),
  {
    id: "fields.marker.none",
    label: "No marker",
    help: "Remove the marker badge from the selection.",
    group: "fields",
    keywords: ["clear marker"],
    when: ({ selected }) => selected.some((item) => item.marker !== "none"),
    run: (context) => changeFields(context.editor.document, ids(context), { marker: "none" }),
  },
  {
    id: "fields.task",
    label: taskLabel,
    help: "Step the selection's task from none to open, to done, and back to none.",
    group: "fields",
    shortcuts: [{ key: "enter", ctrl: true }],
    keywords: ["todo", "checkbox", "complete"],
    when: some,
    run: (context) => {
      const [item] = context.selected;
      changeFields(context.editor.document, ids(context), { task: NEXT_TASK[item.task] });
    },
  },
];
