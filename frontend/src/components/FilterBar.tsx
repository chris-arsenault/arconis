import type { EditorController } from "../editor/controller";
import {
  EMPTY_FILTER,
  filterChoices,
  filterMatches,
  isEmptyFilter,
  toggled,
  type Filter,
} from "../editor/filter";
import { MARKER_SIGNS } from "../editor/marks";
import { MARKER_LABELS } from "../editor/markerLabels";
import { runCommand } from "../editor/registry";
import { isLink, type Marker, type TaskState } from "../document/types";

const TASK_LABELS: Record<TaskState, string> = { open: "☐ To do", done: "☑ Done" };

function Chips<K extends keyof Filter>({
  editor,
  kind,
  values,
  label,
  title,
}: Readonly<{
  editor: EditorController;
  kind: K;
  values: Filter[K][number][];
  label: (value: Filter[K][number]) => string;
  title: string;
}>) {
  if (!values.length) return null;
  const chosen = editor.filter[kind] as Filter[K][number][];
  return (
    <div className="discovery-filter-group">
      <h3>{title}</h3>
      <div className="filter-chips" role="group" aria-label={`Filter by ${kind}`}>
        {values.map((value) => {
          const text = label(value);
          const matching = filterMatches(editor.document.list(), {
            ...EMPTY_FILTER,
            [kind]: [value],
          });
          const count = editor.document
            .list()
            .filter((item) => !isLink(item) && matching.has(item.id)).length;
          return (
            <button
              key={String(value)}
              className="filter-chip"
              aria-label={text}
              aria-pressed={chosen.includes(value)}
              data-hint={`Highlight ${text}`}
              data-hint-detail={`${count} ${count === 1 ? "object" : "objects"}. Other objects stay in place and fade. Choose again to clear.`}
              onClick={() => editor.setFilter(toggled(editor.filter, kind, value))}
            >
              <span>{text}</span>
              <small aria-hidden="true">{count}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Metadata highlights live with canvas search. Choosing chips dims unrelated objects without
 * moving anything; named markers and counts make the available metadata visible.
 */
export function FilterBar({ editor }: Readonly<{ editor: EditorController }>) {
  const choices = filterChoices(editor.document.list());
  const active = !isEmptyFilter(editor.filter);
  return (
    <div className="filter-bar" role="region" aria-label="Filter">
      <Chips
        editor={editor}
        kind="tags"
        title="Tags"
        values={choices.tags}
        label={(tag) => `#${tag}`}
      />
      <Chips
        editor={editor}
        kind="markers"
        title="Markers"
        values={choices.markers}
        label={(marker: Marker) => `${MARKER_SIGNS[marker]} ${MARKER_LABELS[marker]}`}
      />
      <Chips
        editor={editor}
        kind="tasks"
        title="Tasks"
        values={choices.tasks}
        label={(task: TaskState) => TASK_LABELS[task]}
      />
      {choices.authors.length > 0 && (
        <details className="discovery-editors">
          <summary>Edited by</summary>
          <Chips
            editor={editor}
            kind="authors"
            title="People"
            values={choices.authors}
            label={(name) => name}
          />
        </details>
      )}
      {!choices.tags.length && !choices.markers.length && !choices.tasks.length && (
        <span className="filter-empty">
          Add tags or markers to objects to highlight related work here.
        </span>
      )}
      {active && (
        <div className="discovery-filter-actions">
          <button className="text-action" onClick={() => editor.setFilter(EMPTY_FILTER)}>
            Clear highlights
          </button>
          <button
            className="text-action"
            data-hint="Gather matches into a frame"
            data-hint-detail="Moves highlighted objects into a new shared frame. Use Undo to restore their positions."
            onClick={() => runCommand(editor, "structure.gather")}
          >
            Gather into frame
          </button>
        </div>
      )}
    </div>
  );
}
