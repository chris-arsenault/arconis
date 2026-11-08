import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Bookmark,
  Network,
  Plus,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import type { AlignMode } from "../document/relations";
import { branchChildren, referencesOf } from "../document/relations";
import { SCREEN_SIZES } from "../document/screens";
import { isBox, typeLabel, type Item } from "../document/types";
import type { Axis } from "../document/relations";
import { Section } from "./ConnectionControls";

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: LucideIcon }[] = [
  { mode: "left", label: "Align left edges", icon: AlignStartVertical },
  { mode: "center", label: "Align horizontal centers", icon: AlignCenterVertical },
  { mode: "right", label: "Align right edges", icon: AlignEndVertical },
  { mode: "top", label: "Align top edges", icon: AlignStartHorizontal },
  { mode: "middle", label: "Align vertical centers", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom edges", icon: AlignEndHorizontal },
];

function SmallAction({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: Readonly<
  { label: string; icon: LucideIcon; onClick: () => void } & Partial<{ disabled: boolean }>
>) {
  return (
    <button
      className="icon-action"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
    </button>
  );
}

export function AlignControls({
  selected,
  onAlign,
  onDistribute,
}: Readonly<{
  selected: Item[];
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
}>) {
  const objects = selected.filter(isBox);
  if (objects.length < 2) return null;
  return (
    <Section title="Align">
      <div className="selection-actions" role="toolbar" aria-label="Align">
        {ALIGN_ACTIONS.map(({ mode, label, icon }) => (
          <SmallAction key={mode} label={label} icon={icon} onClick={() => onAlign(mode)} />
        ))}
        <SmallAction
          label="Distribute horizontally"
          icon={AlignHorizontalSpaceAround}
          disabled={objects.length < 3}
          onClick={() => onDistribute("horizontal")}
        />
        <SmallAction
          label="Distribute vertically"
          icon={AlignVerticalSpaceAround}
          disabled={objects.length < 3}
          onClick={() => onDistribute("vertical")}
        />
      </div>
    </Section>
  );
}

export function ScreenSizeControl({
  item,
  onSize,
}: Readonly<{ item: Item; onSize: (width: number, height: number) => void }>) {
  if (item.type !== "frame") return null;
  const current = SCREEN_SIZES.find(
    (size) => size.width === item.width && size.height === item.height
  );
  return (
    <Section title="Screen size">
      <select
        aria-label="Screen size"
        value={current?.name ?? ""}
        onChange={(event) => {
          const size = SCREEN_SIZES.find((candidate) => candidate.name === event.target.value);
          if (size) onSize(size.width, size.height);
        }}
      >
        <option value="">Custom</option>
        {SCREEN_SIZES.map((size) => (
          <option key={size.name} value={size.name}>
            {size.name} ({size.width} × {size.height})
          </option>
        ))}
      </select>
    </Section>
  );
}

function ReferenceRow({
  items,
  id,
  other,
  outgoing,
  onJump,
  onRemove,
}: Readonly<{
  items: Item[];
  id: string;
  other: string;
  outgoing: boolean;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
}>) {
  const target = items.find((item) => item.id === other);
  if (!target) return null;
  const name = target.name || typeLabel(target);
  return (
    <li className="reference-row">
      <button className="reference-target" onClick={() => onJump(other)}>
        {outgoing ? "→" : "←"} {name}
      </button>
      <button
        className="icon-action"
        aria-label={`Remove reference to ${name}`}
        title="Remove reference"
        onClick={() => onRemove(id)}
      >
        <X size={13} />
      </button>
    </li>
  );
}

export function TopicControls({
  selected,
  items,
  onBranch,
  onReference,
  onZoom,
  onTidy,
  onJump,
  onRemove,
}: Readonly<{
  selected: Item[];
  items: Item[];
  onBranch: () => void;
  onReference: () => void;
  onZoom: () => void;
  onTidy: () => void;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
}>) {
  const [item] = selected;
  if (!item) return null;
  const single = selected.length === 1;
  const references = single ? referencesOf(items, item.id) : [];
  return (
    <Section title="Topic">
      <div className="selection-actions" role="toolbar" aria-label="Topic actions">
        <SmallAction label="Add branch (Tab)" icon={Plus} disabled={!single} onClick={onBranch} />
        <SmallAction
          label="Add reference"
          icon={Bookmark}
          disabled={selected.length !== 2}
          onClick={onReference}
        />
        <SmallAction label="Zoom in (Z)" icon={ZoomIn} disabled={!single} onClick={onZoom} />
        <SmallAction
          label="Tidy branches"
          icon={Network}
          disabled={!single || !branchChildren(items, item.id).length}
          onClick={onTidy}
        />
      </div>
      {references.length > 0 && (
        <ul className="reference-list" aria-label="References">
          {references.map((reference) => (
            <ReferenceRow
              key={reference.id}
              items={items}
              onJump={onJump}
              onRemove={onRemove}
              {...reference}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}
