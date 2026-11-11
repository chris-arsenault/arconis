import { useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  LocateFixed,
  ListOrdered,
  Lock,
  MapPin,
  MapPinOff,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import { MARKERS, TASK_STATES, type Item, type TaskState } from "../document/types";
import { branchChildren, holdsOthers } from "../document/relations";
import {
  TREE_DIRECTIONS,
  type TreeDirection,
  type TreeLayoutOptions,
} from "../document/treeLayout";
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
  detail,
  icon: Icon,
  offIcon: OffIcon,
  onClick,
}: Readonly<{
  on: boolean;
  label: string;
  offLabel: string;
  detail: string;
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
      data-hint-detail={detail}
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
  detail,
  placeholder,
  value,
  className,
  onCommit,
}: Readonly<{
  label: string;
  detail: string;
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
      data-hint-detail={detail}
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

/** Lock, jump point and, for anything that holds others, collapse: the selection's state on the canvas. */
export function StateToggles({
  selected,
  items,
  onChange,
}: Readonly<{ selected: Item[]; items: Item[]; onChange: Change }>) {
  const locked = selected.every((candidate) => candidate.locked);
  const jump = selected.every((candidate) => candidate.jump);
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
        detail="Locked objects can't be moved, resized, edited or deleted by anyone until unlocked."
        icon={Lock}
        offIcon={Unlock}
        onClick={() => onChange({ locked: !locked })}
      />
      <ToggleButton
        on={jump}
        label="Mark as jump point"
        offLabel="Remove jump point"
        detail="Jump points are listed in Navigate, where anyone in the room can fly to them."
        icon={MapPin}
        offIcon={MapPinOff}
        onClick={() => onChange({ jump: !jump })}
      />
      {collapsible && (
        <ToggleButton
          on={collapsed}
          label="Collapse"
          offLabel="Expand"
          detail="Collapsing folds away what an object holds and its branches, for everyone."
          icon={ChevronsDownUp}
          offIcon={ChevronsUpDown}
          onClick={() => onChange({ collapsed: !collapsed })}
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
      detail="Numbered topics label their branches 1, 1.1, 1.2 in the order they sit."
      icon={ListOrdered}
      offIcon={ListOrdered}
      onClick={() => onChange({ numbered: !numbered })}
    />
  );
}

const TIDY_DIRECTIONS: Record<TreeDirection, string> = {
  sides: "Sides as placed",
  balanced: "Balanced on both sides",
  right: "To the right",
  left: "To the left",
  down: "Downward",
};

/** How Tidy lays out this topic's tree; the tree remembers, and each change tidies it again. */
export function TidyOptions({
  selected,
  items,
  onChange,
}: Readonly<{
  selected: Item[];
  items: Item[];
  onChange: (values: Partial<TreeLayoutOptions>) => void;
}>) {
  const [root] = selected;
  if (selected.length !== 1 || !branchChildren(items, root.id).length) return null;
  return (
    <div className="tidy-options" role="group" aria-label="Tidy options">
      <select
        aria-label="Tidy direction"
        data-hint-detail="Where Tidy puts this topic's branches; choosing one tidies the tree that way."
        value={root.tidy.direction}
        onChange={(event) => onChange({ direction: event.target.value as TreeDirection })}
      >
        {TREE_DIRECTIONS.map((direction) => (
          <option key={direction} value={direction}>
            {TIDY_DIRECTIONS[direction]}
          </option>
        ))}
      </select>
      <label data-hint-detail="Tidy with tighter gaps between branches.">
        <input
          type="checkbox"
          checked={root.tidy.compact}
          onChange={(event) => onChange({ compact: event.target.checked })}
        />
        Compact
      </label>
      <label data-hint-detail="Tidy with branches in alphabetical order.">
        <input
          type="checkbox"
          checked={root.tidy.sorted}
          onChange={(event) => onChange({ sorted: event.target.checked })}
        />
        Sorted by name
      </label>
    </div>
  );
}

/** Marker, task state and link, applied to the whole selection. */
export function StatusFields({
  selected,
  onChange,
  onFollow,
}: Readonly<{ selected: Item[]; onChange: Change; onFollow: (link: string) => void }>) {
  const common = (key: "marker" | "task" | "link") =>
    selected.every((item) => item[key] === selected[0][key]) ? selected[0][key] : null;
  const marker = common("marker");
  const task = common("task");
  const linkValue = common("link");
  return (
    <div className="select-grid">
      <span>Marker</span>
      <select
        aria-label="Marker"
        data-hint-detail="Put a shape badge beside the selected objects; its meaning is yours to decide."
        value={marker ?? "mixed"}
        onChange={(event) => onChange({ marker: event.target.value as Item["marker"] })}
      >
        {marker === null && (
          <option value="mixed" disabled>
            Mixed
          </option>
        )}
        <option value="none">None</option>
        {MARKERS.map((marker) => (
          <option key={marker} value={marker}>
            {MARKER_SIGNS[marker]} {MARKER_LABELS[marker]}
          </option>
        ))}
      </select>
      <span>Task</span>
      <select
        aria-label="Task"
        data-hint-detail="Make the selected objects to-dos; done tasks fade on the canvas."
        value={task ?? "mixed"}
        onChange={(event) => onChange({ task: event.target.value as Item["task"] })}
      >
        {task === null && (
          <option value="mixed" disabled>
            Mixed
          </option>
        )}
        <option value="none">Not a task</option>
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
        detail="Point the selected objects at a web address or object id."
        placeholder={value === null ? "Mixed links" : "Web address or item id"}
        value={link}
        onCommit={(text) => onChange({ link: text.trim() })}
      />
      {link && (
        <button
          className="icon-action link-follow"
          aria-label={followLabel}
          data-hint={followLabel}
          data-hint-detail="Web addresses open in a new tab; objects fly into sight."
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
          onClick={() => onChange({ link: "" })}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
