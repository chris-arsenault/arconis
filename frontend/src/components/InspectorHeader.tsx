import type { KeyboardEvent } from "react";
import type { EditorController } from "../editor/controller";
import { isAvailable, findCommand, commandContext, runCommand } from "../editor/registry";
import { KINDS, kindOf } from "../editor/swap";
import { typeLabel, type Item } from "../document/types";
import { hasText } from "../document/capabilities";
import { itemName } from "../editor/relate";

const INSPECTOR_TABS = ["Design", "Arrange", "Data"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
const TAB_DETAILS: Record<InspectorTab, string> = {
  Design: "Edit the selection's content, position, size and appearance.",
  Arrange: "Organize layers, alignment, object state and relationships.",
  Data: "Edit tags, status, links and named properties on the selection.",
};

export function PropertyTabs({
  panelId,
  tab,
  onChoose,
}: Readonly<{
  panelId: string;
  tab: InspectorTab;
  onChoose: (tab: InspectorTab) => void;
}>) {
  return (
    <div
      className="inspector-tabs"
      role="tablist"
      tabIndex={-1}
      aria-label="Property categories"
      onKeyDown={(event) => navigateTabs(event, tab, onChoose)}
    >
      {INSPECTOR_TABS.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          id={`${panelId}-${name}-tab`}
          aria-selected={tab === name}
          aria-controls={`${panelId}-${name}`}
          data-hint-detail={TAB_DETAILS[name]}
          tabIndex={tab === name ? 0 : -1}
          onClick={() => onChoose(name)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function navigateTabs(
  event: KeyboardEvent<HTMLElement>,
  tab: InspectorTab,
  choose: (tab: InspectorTab) => void
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = INSPECTOR_TABS.indexOf(tab);
  const direction = event.key === "ArrowRight" ? 1 : -1;
  let next = (current + direction + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = INSPECTOR_TABS.length - 1;
  choose(INSPECTOR_TABS[next]);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}

/** What is selected, its editable kind, and a direct way to edit its text. */
export function InspectorHeader({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [item] = selected;
  const several = selected.length > 1;
  return (
    <header className="inspector-header">
      <div className="inspector-heading">
        <ObjectTypeSelect editor={editor} selected={selected} />
        <span className="inspector-kind" data-testid="selection-count">
          {several ? `${selected.length} objects` : typeLabel(item)}
        </span>
        {!several && hasText(item) && (
          <button
            className="inspector-name"
            data-hint="Edit text on the canvas (Enter)"
            data-hint-detail="Type straight onto the object; everyone in the room sees the text change."
            onClick={() => runCommand(editor, "edit.text")}
          >
            {item.name.trim() ? itemName(item) : "Add text"}
          </button>
        )}
      </div>
    </header>
  );
}

function ObjectTypeSelect({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [item] = selected;
  const kinds = selected.map(kindOf);
  const changeable =
    kinds.every((kind) => kind !== null) &&
    isAvailable(findCommand("shape.rectangle"), commandContext(editor));
  const kind = kinds.every((value) => value === kinds[0]) ? kinds[0] : "";
  if (!changeable) return null;
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
