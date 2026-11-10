import { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  LocateFixed,
  Eye,
  EyeOff,
  ListOrdered,
  Lock,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import { MARKERS, TASK_STATES, type Item, type Marker, type TaskState } from "../document/types";
import { branchChildren, holdsOthers } from "../document/relations";
import { isWebLink } from "../language/fields";
import { isCanvasObjectUrl } from "../document/ids";
import { MARKER_SIGNS } from "../editor/marks";
import { MARKER_LABELS } from "../editor/fieldCommands";

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
      data-hint={title}
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

/** Lock, hide and, for anything that holds others, collapse: the selection's state on the canvas. */
export function StateToggles({
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
    </div>
  );
}

/** Numbers a topic's branches 1, 1.1, 1.2; shown only for a topic that has branches. */
export function NumberBranchesToggle({
  selected,
  items,
  onChange,
}: Readonly<{ selected: Item[]; items: Item[]; onChange: Change }>) {
  if (!selected.some((candidate) => branchChildren(items, candidate.id).length > 0)) return null;
  const numbered = selected.every((candidate) => candidate.numbered);
  return (
    <ToggleButton
      on={numbered}
      label="Number branches"
      offLabel="Unnumber branches"
      icon={ListOrdered}
      offIcon={ListOrdered}
      onClick={() => onChange({ numbered: numbered ? undefined : true })}
    />
  );
}

/** Marker, task state and link, applied to the whole selection. */
export function StatusFields({
  selected,
  onChange,
  onFollow,
}: Readonly<{ selected: Item[]; onChange: Change; onFollow: (link: string) => void }>) {
  const common = (key: "marker" | "task" | "link") =>
    selected.every((item) => item[key] === selected[0][key]) ? (selected[0][key] ?? "") : null;
  const marker = common("marker");
  const task = common("task");
  const linkValue = common("link");
  return (
    <div className="select-grid">
      <span>Marker</span>
      <select
        aria-label="Marker"
        value={marker ?? "mixed"}
        onChange={(event) =>
          onChange({ marker: (event.target.value || undefined) as Marker | undefined })
        }
      >
        {marker === null && (
          <option value="mixed" disabled>
            Mixed
          </option>
        )}
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
        value={task ?? "mixed"}
        onChange={(event) =>
          onChange({ task: (event.target.value || undefined) as TaskState | undefined })
        }
      >
        {task === null && (
          <option value="mixed" disabled>
            Mixed
          </option>
        )}
        <option value="">Not a task</option>
        {TASK_STATES.map((state) => (
          <option key={state} value={state}>
            {TASK_LABELS[state]}
          </option>
        ))}
      </select>
      <span>Link</span>
      <LinkControl selected={selected} value={linkValue} onChange={onChange} onFollow={onFollow} />
    </div>
  );
}

function LinkControl({
  selected,
  value,
  onChange,
  onFollow,
}: Readonly<{
  selected: Item[];
  value: string | null;
  onChange: Change;
  onFollow: (link: string) => void;
}>) {
  const link = value ?? "";
  const external = isWebLink(link) && !isCanvasObjectUrl(link);
  const followLabel = external ? "Open link" : "Go to linked item";
  const LinkIcon = external ? ExternalLink : LocateFixed;
  return (
    <div className="control-row link-row">
      <CommittedField
        key={`link ${selected.map((item) => item.id).join(" ")} ${value}`}
        className="link-field"
        label="Link"
        placeholder={value === null ? "Mixed links" : "Web address or item id"}
        value={link}
        onCommit={(text) => onChange({ link: text.trim() || undefined })}
      />
      {link && (
        <button
          className="icon-action link-follow"
          aria-label={followLabel}
          data-hint={followLabel}
          onClick={() => onFollow(link)}
        >
          <LinkIcon size={14} />
        </button>
      )}
      {(value === null || link) && (
        <button
          className="icon-action"
          aria-label="Clear links"
          data-hint="Clear links"
          data-hint-detail="Remove links from every selected object."
          onClick={() => onChange({ link: undefined })}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
