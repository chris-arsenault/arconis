import { MARKERS, type Item } from "../document/types";
import { holdsOthers } from "../document/relations";
import { showFilter, showTagger, type Command, type CommandContext } from "./registry";
import { changeFields } from "./commands";
import { filterMatches, isEmptyFilter } from "./filter";
import { gatherIntoFrame } from "./gather";
import { MARKER_LABELS } from "./markerLabels";

export { MARKER_LABELS } from "./markerLabels";

/** Commands over the fields every item carries: lock, hide, collapse and task state. */

const some = ({ selected }: CommandContext) => selected.length > 0;
const ids = ({ selected }: CommandContext) => selected.map((item) => item.id);

/** Toggling a task walks it from nothing to open, to done, and back to nothing. */
const NEXT_TASK: Record<"none" | "open" | "done", Item["task"]> = {
  none: "open",
  open: "done",
  done: undefined,
};

function taskLabel({ selected }: CommandContext) {
  const [item] = selected;
  if (!item?.task) return "Make a task";
  return item.task === "open" ? "Mark done" : "Clear task";
}

/** The items a gather takes: the filter's matches, or the selection when nothing is filtered. */
function gathered({ editor, items, selected }: CommandContext) {
  if (isEmptyFilter(editor.filter)) return selected.map((item) => item.id);
  return [...filterMatches(items, editor.filter)];
}

export const FIELD_COMMANDS: Command[] = [
  {
    id: "view.filter",
    label: ({ editor }) =>
      editor.ui.filter ? "Close the filter" : "Filter by tag, marker, task or editor",
    group: "view",
    shortcuts: [{ key: "f", ctrl: true, shift: true }],
    keywords: ["dim", "tags", "markers", "tasks", "author"],
    run: ({ editor }) => showFilter(editor, !editor.ui.filter),
  },
  {
    id: "structure.gather",
    label: ({ editor }) =>
      isEmptyFilter(editor.filter)
        ? "Gather the selection into a frame"
        : "Gather matches into a frame",
    group: "structure",
    keywords: ["cluster", "sort", "collect"],
    when: (context) => gathered(context).length > 0,
    run: (context) => {
      const id = gatherIntoFrame(context.editor.document, gathered(context));
      if (id) context.editor.select(id);
    },
  },
  {
    id: "fields.lock",
    label: ({ selected }) => (selected.every((item) => item.locked) ? "Unlock" : "Lock"),
    group: "fields",
    shortcuts: [{ key: "l", ctrl: true, shift: true }],
    when: some,
    run: (context) => {
      const locked = context.selected.every((item) => item.locked);
      changeFields(context.editor.document, ids(context), { locked: locked ? undefined : true });
    },
  },
  {
    id: "fields.unlockAll",
    label: ({ items }) => `Unlock all (${items.filter((item) => item.locked).length})`,
    group: "fields",
    when: ({ items }) => items.some((item) => item.locked),
    run: ({ editor, items }) =>
      changeFields(
        editor.document,
        items.filter((item) => item.locked).map((item) => item.id),
        { locked: undefined }
      ),
  },
  {
    id: "fields.hide",
    label: "Hide",
    group: "fields",
    shortcuts: [{ key: "h", ctrl: true, shift: true }],
    when: ({ selected }) => selected.some((item) => !item.hidden),
    run: (context) => changeFields(context.editor.document, ids(context), { hidden: true }),
  },
  {
    id: "fields.showHidden",
    label: ({ items }) => `Show ${items.filter((item) => item.hidden).length} hidden`,
    group: "fields",
    keywords: ["unhide", "reveal"],
    when: ({ items }) => items.some((item) => item.hidden),
    run: ({ editor, items }) =>
      changeFields(
        editor.document,
        items.filter((item) => item.hidden).map((item) => item.id),
        { hidden: undefined }
      ),
  },
  {
    id: "fields.collapse",
    label: ({ selected }) => (selected.every((item) => item.collapsed) ? "Expand" : "Collapse"),
    group: "fields",
    shortcuts: [{ key: ".", ctrl: true }],
    keywords: ["fold", "unfold"],
    when: ({ selected, items }) =>
      selected.length > 0 && selected.some((item) => item.collapsed || holdsOthers(items, item.id)),
    run: (context) => {
      const collapsed = context.selected.every((item) => item.collapsed);
      changeFields(context.editor.document, ids(context), {
        collapsed: collapsed ? undefined : true,
      });
    },
  },
  {
    id: "fields.tag",
    label: "Tag…",
    group: "fields",
    keywords: ["tags", "label", "category", "hashtag"],
    when: some,
    run: ({ editor }) => showTagger(editor, true),
  },
  ...MARKERS.map((marker): Command => ({
    id: `fields.marker.${marker}`,
    label: MARKER_LABELS[marker],
    group: "fields",
    keywords: ["marker", "priority", "progress"],
    when: some,
    run: (context) => changeFields(context.editor.document, ids(context), { marker }),
  })),
  {
    id: "fields.marker.none",
    label: "No marker",
    group: "fields",
    keywords: ["clear marker"],
    when: ({ selected }) => selected.some((item) => item.marker),
    run: (context) => changeFields(context.editor.document, ids(context), { marker: undefined }),
  },
  {
    id: "fields.task",
    label: taskLabel,
    group: "fields",
    shortcuts: [{ key: "enter", ctrl: true }],
    keywords: ["todo", "checkbox", "complete"],
    when: some,
    run: (context) => {
      const [item] = context.selected;
      changeFields(context.editor.document, ids(context), { task: NEXT_TASK[item.task ?? "none"] });
    },
  },
];
