import type { EditorController } from "../editor/controller";
import { isAvailable, findCommand, commandContext, runCommand } from "../editor/registry";
import { KINDS, kindOf } from "../editor/swap";
import { typeLabel, type Item } from "../document/types";
import { hasText } from "../document/capabilities";
import { showTextEditor } from "../editor/ui";

/** Selection kind and a direct way to edit text; the text itself stays on the canvas. */
export function InspectorHeader({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  return (
    <header className="inspector-header">
      <div className="inspector-heading">
        <SelectionSummary selected={selected} />
        <ObjectTypeSelect editor={editor} selected={selected} />
        {selected.some(hasText) && (
          <button
            className="text-action inspector-edit-text"
            aria-label="Edit text"
            data-hint-detail="Open the full text editor with Markdown, preview, subtitle and typography controls."
            onClick={() =>
              showTextEditor(
                editor,
                selected.filter(hasText).map((target) => target.id)
              )
            }
          >
            Edit text…
          </button>
        )}
      </div>
    </header>
  );
}

function SelectionSummary({ selected }: Readonly<{ selected: Item[] }>) {
  if (selected.length === 1) return null;
  return (
    <span className="inspector-kind" data-testid="selection-count">
      {selected.length > 1 ? `${selected.length} objects` : typeLabel(selected[0])}
    </span>
  );
}

function ObjectTypeSelect({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [item] = selected;
  const kinds = selected.map((target) => (target.clock ? null : kindOf(target)));
  const changeable =
    kinds.every((kind) => kind !== null) &&
    isAvailable(findCommand("shape.rectangle"), commandContext(editor));
  const kind = kinds.every((value) => value === kinds[0]) ? kinds[0] : "";
  if (!changeable && selected.length > 1) return null;
  if (!changeable)
    return (
      <span className="inspector-kind inspector-object-kind" data-testid="selection-count">
        {typeLabel(item)}
      </span>
    );
  return (
    <label
      className="inspector-type"
      data-hint-detail="Change the selected objects' type while keeping their text and relationships."
    >
      Object type
      <select
        aria-label="Object type"
        value={kind ?? ""}
        onChange={(event) => runCommand(editor, `shape.${event.target.value}`)}
      >
        {!kind && (
          <option value="" disabled>
            Mixed types
          </option>
        )}
        {kind && !KINDS.includes(kind) && (
          <option value={kind} disabled>
            {typeLabel(item)}
          </option>
        )}
        {KINDS.map((value) => {
          const command = findCommand(`shape.${value}`);
          const label =
            typeof command.label === "string" ? command.label.replace(/^Change to /, "") : value;
          return (
            <option key={value} value={value}>
              {label[0].toUpperCase() + label.slice(1)}
            </option>
          );
        })}
      </select>
    </label>
  );
}
