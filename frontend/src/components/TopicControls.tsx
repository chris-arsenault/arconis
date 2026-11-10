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
  Spline,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AlignMode } from "../document/relations";
import { branchChildren, branchParent, referencesOf } from "../document/relations";
import { SCREEN_SIZES } from "../document/screens";
import { isBox, isLink, type Item } from "../document/types";
import { itemName } from "../editor/relate";
import type { Axis } from "../document/relations";
import { Section } from "./ConnectionControls";
import type { Appearance } from "../document/appearance";

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: LucideIcon }[] = [
  { mode: "left", label: "Align left edges", icon: AlignStartVertical },
  { mode: "center", label: "Align horizontal centers", icon: AlignCenterVertical },
  { mode: "right", label: "Align right edges", icon: AlignEndVertical },
  { mode: "top", label: "Align top edges", icon: AlignStartHorizontal },
  { mode: "middle", label: "Align vertical centers", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom edges", icon: AlignEndHorizontal },
];

const ALIGN_DETAIL = "Line up the selected objects on this edge or center of the group.";
const DISTRIBUTE_DETAIL =
  "Even out the gaps between three or more selected objects; the outermost stay put.";

function SmallAction({
  label,
  detail,
  icon: Icon,
  onClick,
  disabled,
}: Readonly<{
  label: string;
  detail: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled: boolean;
}>) {
  return (
    <button
      className="icon-action"
      data-hint={label}
      data-hint-detail={detail}
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
          <SmallAction
            key={mode}
            label={label}
            detail={ALIGN_DETAIL}
            icon={icon}
            disabled={false}
            onClick={() => onAlign(mode)}
          />
        ))}
        <SmallAction
          label="Distribute horizontally"
          detail={DISTRIBUTE_DETAIL}
          icon={AlignHorizontalSpaceAround}
          disabled={objects.length < 3}
          onClick={() => onDistribute("horizontal")}
        />
        <SmallAction
          label="Distribute vertically"
          detail={DISTRIBUTE_DETAIL}
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
        data-hint-detail="Resize this frame to match a common device screen."
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

/** One related item: what it is to the selection, its name to jump to, and a way to undo it. */
function RelationRow({
  relation,
  target,
  onJump,
  onRemove,
}: Readonly<{
  relation: string;
  target: Item;
  onJump: (id: string) => void;
  onRemove: (() => void) | null;
}>) {
  const name = itemName(target);
  return (
    <li className="relation-row">
      <span className="relation-kind">{relation}</span>
      <button
        className="relation-target"
        data-hint={`Go to ${name}`}
        data-hint-detail="Select this object and fly the view to it."
        onClick={() => onJump(target.id)}
      >
        {name}
      </button>
      {onRemove && (
        <button
          className="icon-action"
          aria-label={`Remove reference to ${name}`}
          data-hint="Remove reference"
          data-hint-detail="Delete this reference for everyone; both objects stay."
          onClick={onRemove}
        >
          <X size={13} />
        </button>
      )}
    </li>
  );
}

interface Relation {
  key: string;
  relation: string;
  target: Item;
  remove: string;
}

/** Everything one item is related to: its parent topic, its holder, its references and lines. */
function relationsOf(
  items: Item[],
  item: Item,
  appearance: (item: Item) => Appearance
): Relation[] {
  const byId = new Map(items.map((candidate) => [candidate.id, candidate]));
  const found: Relation[] = [];
  const add = (key: string, relation: string, id: string | undefined, remove?: string) => {
    const target = id ? byId.get(id) : undefined;
    if (target) found.push({ key, relation, target, remove: remove ?? "" });
  };
  add("parent", "Branch of", branchParent(items, item.id));
  if (!item.onLine) add("inside", "Inside", item.inside);
  if (isLink(item)) {
    add("from", "From", item.from);
    add("to", "To", item.to);
  }
  for (const reference of referencesOf(items, item.id))
    add(
      reference.id,
      reference.outgoing ? "Refers to" : "Referred by",
      reference.other,
      reference.id
    );
  for (const line of items) {
    if (line.type !== "line" || (line.from !== item.id && line.to !== item.id)) continue;
    const forward = line.from === item.id;
    add(line.id, lineRelation(appearance(line), forward), forward ? line.to : line.from);
  }
  return found;
}

function lineRelation(look: Appearance, forward: boolean) {
  const away = (forward ? look.arrow : look.startArrow) !== "none";
  const toward = (forward ? look.startArrow : look.arrow) !== "none";
  if (away && toward) return "↔ Both ways";
  if (away) return "→ To";
  if (toward) return "← From";
  return "— Linked";
}

const ACTION_DETAILS: Record<string, string> = {
  "Relate these two":
    "Add a reference between them; its line shows only while either one is selected.",
  "Connect with a line":
    "Draw a connector from the first selected object to the second that always shows.",
  Tidy: "Lay this topic's branches out again as a neat tree.",
  "Add branch": "Add a connected topic branching from this object and start typing in it.",
  "Relate to…": "Pick another object to reference; the line shows while either one is selected.",
  "Zoom into": "Fly your view in until this object fills the screen; others keep their view.",
};

function Action({
  label,
  icon: Icon,
  onClick,
}: Readonly<{ label: string; icon: LucideIcon; onClick: () => void }>) {
  return (
    <button className="text-action" data-hint-detail={ACTION_DETAILS[label]} onClick={onClick}>
      <Icon size={14} /> {label}
    </button>
  );
}

/**
 * How the selection sits among other things, and the ways to relate it: branch it, relate it to
 * another object by name, or with two selected, relate or connect them.
 */
export function Relationships({
  selected,
  items,
  run,
  onJump,
  onRemove,
  children,
  appearance,
}: Readonly<{
  selected: Item[];
  items: Item[];
  /** Runs a command from the command table by id. */
  run: (id: string) => void;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
  /** Branch numbering, shown beside the branch count. */
  children: ReactNode;
  appearance: (item: Item) => Appearance;
}>) {
  if (selected.length === 2)
    return (
      <div className="relation-actions">
        <Action label="Relate these two" icon={Bookmark} onClick={() => run("structure.relate")} />
        <Action
          label="Connect with a line"
          icon={Spline}
          onClick={() => run("structure.connect")}
        />
      </div>
    );
  const [item] = selected;
  const relations = relationsOf(items, item, appearance);
  const branches = branchChildren(items, item.id).length;
  return (
    <>
      {relations.length > 0 && (
        <ul className="relation-list" aria-label="Related items">
          {relations.map(({ key, relation, target, remove }) => (
            <RelationRow
              key={key}
              relation={relation}
              target={target}
              onJump={onJump}
              onRemove={remove ? () => onRemove(remove) : null}
            />
          ))}
        </ul>
      )}
      {branches > 0 && (
        <div className="relation-branches">
          <span>
            {branches} {branches === 1 ? "branch" : "branches"}
          </span>
          <Action label="Tidy" icon={Network} onClick={() => run("structure.tidy")} />
          {children}
        </div>
      )}
      <div className="relation-actions">
        <Action label="Add branch" icon={Plus} onClick={() => run("structure.branch")} />
        <Action label="Relate to…" icon={Bookmark} onClick={() => run("structure.relate")} />
        <Action label="Zoom into" icon={ZoomIn} onClick={() => run("view.zoomInto")} />
      </div>
    </>
  );
}
