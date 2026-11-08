import { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  Eye,
  EyeOff,
  ListOrdered,
  Lock,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import { MARKERS, TASK_STATES, type Item, type Marker, type TaskState } from "../document/types";
import { branchChildren, holdsOthers } from "../document/relations";
import { isWebLink, parseTags } from "../language/fields";
import { MARKER_SIGNS } from "../editor/marks";
import { Section } from "./ConnectionControls";

/** How each marker reads in a menu. */
const MARKER_LABELS: Record<Marker, string> = {
  p1: "Priority 1",
  p2: "Priority 2",
  p3: "Priority 3",
  p4: "Priority 4",
  p5: "Priority 5",
  q0: "Not started",
  q1: "A quarter done",
  q2: "Half done",
  q3: "Three quarters done",
  q4: "Complete",
};
const TASK_LABELS: Record<TaskState, string> = { open: "To do", done: "Done" };

type Change = (values: Partial<Item>) => void;

function ToggleButton({
  on,
  label,
  offLabel,
  icon: Icon,
  offIcon: OffIcon,
  onClick,
}: Readonly<{
  on: boolean;
  label: string;
  offLabel: string;
  icon: LucideIcon;
  offIcon: LucideIcon;
  onClick: () => void;
}>) {
  const title = on ? offLabel : label;
  return (
    <button
      className="text-action"
      aria-label={title}
      title={title}
      aria-pressed={on}
      onClick={onClick}
    >
      {on ? <OffIcon size={14} /> : <Icon size={14} />} {title}
    </button>
  );
}

/** A text field that commits on Enter or blur. It is keyed by its value, so outside edits reset it. */
function CommittedField({
  label,
  placeholder,
  value,
  className,
  onCommit,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  className: string;
  onCommit: (text: string) => void;
}>) {
  const [text, setText] = useState(value);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      className={className}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function FieldToggles({
  selected,
  items,
  onChange,
}: Readonly<{ selected: Item[]; items: Item[]; onChange: Change }>) {
  const locked = selected.every((candidate) => candidate.locked);
  const hidden = selected.every((candidate) => candidate.hidden);
  const collapsible = selected.some(
    (candidate) => candidate.collapsed || holdsOthers(items, candidate.id)
  );
  const collapsed = selected.every((candidate) => candidate.collapsed);
  const heads = selected.some((candidate) => branchChildren(items, candidate.id).length > 0);
  const numbered = selected.every((candidate) => candidate.numbered);
  return (
    <div className="field-toggles">
      <ToggleButton
        on={locked}
        label="Lock"
        offLabel="Unlock"
        icon={Lock}
        offIcon={Unlock}
        onClick={() => onChange({ locked: locked ? undefined : true })}
      />
      <ToggleButton
        on={hidden}
        label="Hide"
        offLabel="Show"
        icon={EyeOff}
        offIcon={Eye}
        onClick={() => onChange({ hidden: hidden ? undefined : true })}
      />
      {collapsible && (
        <ToggleButton
          on={collapsed}
          label="Collapse"
          offLabel="Expand"
          icon={ChevronsDownUp}
          offIcon={ChevronsUpDown}
          onClick={() => onChange({ collapsed: collapsed ? undefined : true })}
        />
      )}
      {heads && (
        <ToggleButton
          on={numbered}
          label="Number branches"
          offLabel="Unnumber branches"
          icon={ListOrdered}
          offIcon={ListOrdered}
          onClick={() => onChange({ numbered: numbered ? undefined : true })}
        />
      )}
    </div>
  );
}

function FieldChoices({ item, onChange }: Readonly<{ item: Item; onChange: Change }>) {
  return (
    <div className="select-grid">
      <span>Marker</span>
      <select
        aria-label="Marker"
        value={item.marker ?? ""}
        onChange={(event) =>
          onChange({ marker: (event.target.value || undefined) as Marker | undefined })
        }
      >
        <option value="">None</option>
        {MARKERS.map((marker) => (
          <option key={marker} value={marker}>
            {MARKER_SIGNS[marker]} {MARKER_LABELS[marker]}
          </option>
        ))}
      </select>
      <span>Task</span>
      <select
        aria-label="Task"
        value={item.task ?? ""}
        onChange={(event) =>
          onChange({ task: (event.target.value || undefined) as TaskState | undefined })
        }
      >
        <option value="">Not a task</option>
        {TASK_STATES.map((state) => (
          <option key={state} value={state}>
            {TASK_LABELS[state]}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The fields every item carries: lock, hide and collapse, tags, a marker, a task state and a link,
 * applied to the whole selection, and who last edited the first item.
 */
export function FieldControls({
  selected,
  items,
  onChange,
  onFollow,
}: Readonly<{
  selected: Item[];
  items: Item[];
  onChange: Change;
  onFollow: (link: string) => void;
}>) {
  const [item] = selected;
  if (!item) return null;
  const tags = (item.tags ?? []).join(", ");
  const link = item.link ?? "";
  const followLabel = isWebLink(link) ? "Open link" : "Go to linked item";
  return (
    <Section title="Fields">
      <FieldToggles selected={selected} items={items} onChange={onChange} />
      <CommittedField
        key={`tags ${tags}`}
        className="object-subtitle"
        label="Tags"
        placeholder="Tags, separated by commas"
        value={tags}
        onCommit={(text) => {
          const parsed = parseTags(text);
          onChange({ tags: parsed.length ? parsed : undefined });
        }}
      />
      <FieldChoices item={item} onChange={onChange} />
      <div className="control-row">
        <CommittedField
          key={`link ${link}`}
          className="object-subtitle link-field"
          label="Link"
          placeholder="Web address or item id"
          value={link}
          onCommit={(text) => onChange({ link: text.trim() || undefined })}
        />
        {link && (
          <button
            className="icon-action link-follow"
            aria-label={followLabel}
            title={followLabel}
            onClick={() => onFollow(link)}
          >
            <ExternalLink size={14} />
          </button>
        )}
      </div>
      {selected.length === 1 && item.editedBy !== undefined && item.editedAt !== undefined && (
        <p className="edited-by" data-testid="edited-by">
          Last edited by {item.editedBy}, {new Date(item.editedAt).toLocaleString()}
        </p>
      )}
    </Section>
  );
}
