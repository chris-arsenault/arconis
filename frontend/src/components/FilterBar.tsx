import { X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { filterChoices, isEmptyFilter, toggled, type Filter } from "../editor/filter";
import { MARKER_SIGNS } from "../editor/marks";
import { runCommand, showFilter } from "../editor/registry";
import type { Marker, TaskState } from "../document/types";

const TASK_LABELS: Record<TaskState, string> = { open: "☐ To do", done: "☑ Done" };

function Chips<K extends keyof Filter>({
  editor,
  kind,
  values,
  label,
}: Readonly<{
  editor: EditorController;
  kind: K;
  values: Filter[K][number][];
  label: (value: Filter[K][number]) => string;
}>) {
  if (!values.length) return null;
  const chosen = editor.filter[kind] as Filter[K][number][];
  return (
    <span className="filter-chips" role="group" aria-label={`Filter by ${kind}`}>
      {values.map((value) => (
        <button
          key={String(value)}
          className="filter-chip"
          aria-pressed={chosen.includes(value)}
          onClick={() => editor.setFilter(toggled(editor.filter, kind, value))}
        >
          {label(value)}
        </button>
      ))}
    </span>
  );
}

/**
 * The filter bar: every tag, marker, task state and editor on the canvas as a chip. Chosen chips
 * keep their items bright and dim the rest; Gather moves what matches into one frame.
 */
export function FilterBar({ editor }: Readonly<{ editor: EditorController }>) {
  const choices = filterChoices(editor.document.list());
  const active = !isEmptyFilter(editor.filter);
  return (
    <div className="filter-bar" role="region" aria-label="Filter">
      <Chips editor={editor} kind="tags" values={choices.tags} label={(tag) => `#${tag}`} />
      <Chips
        editor={editor}
        kind="markers"
        values={choices.markers}
        label={(marker: Marker) => MARKER_SIGNS[marker]}
      />
      <Chips
        editor={editor}
        kind="tasks"
        values={choices.tasks}
        label={(task: TaskState) => TASK_LABELS[task]}
      />
      <Chips editor={editor} kind="authors" values={choices.authors} label={(name) => name} />
      {!choices.tags.length && !choices.markers.length && !choices.tasks.length && (
        <span className="filter-empty">Nothing to filter by yet: add tags, markers or tasks.</span>
      )}
      <button
        className="text-action"
        disabled={!active}
        onClick={() => runCommand(editor, "structure.gather")}
      >
        Gather matches
      </button>
      <button
        className="icon-action"
        aria-label="Close filter"
        onClick={() => showFilter(editor, false)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
