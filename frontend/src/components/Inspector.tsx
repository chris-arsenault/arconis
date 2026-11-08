import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  SendToBack,
  Copy,
  Group,
  Ungroup,
  Trash2,
  Link2,
  Bold,
  Italic,
  type LucideIcon,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { COLORS, isBox, isFrame, isLink, typeLabel, type Item, type Look } from "../document/types";
import { useCollaborativeText } from "../document/useCollaborativeText";
import { isLockedIcon } from "../document/geometry";
import { objectStyle } from "../editor/styles";
import { ConnectionControls, Section } from "./ConnectionControls";
import { AlignControls, ScreenSizeControl, TopicControls } from "./TopicControls";
import { CommentControls } from "./CommentControls";
import { SlideControls } from "./SlideControls";
import { isSlide } from "../document/slides";

type ItemProps = Readonly<{ editor: EditorController; item: Item }>;
type ChangeLook = (values: Look) => void;
/** `drawn` is the item as rendered, so controls show defaults the item does not set itself. */
type StyleProps = Readonly<{ item: Item; drawn: Record<string, unknown>; change: ChangeLook }>;

const isIcon = (item: Item) => item.type === "node" && item.stencil === "icon";
const HAS_FILL = (item: Item) =>
  isBox(item) && item.type !== "text" && item.type !== "picture" && !isIcon(item);
const HAS_LINE = (item: Item) => item.type !== "note" && item.type !== "text" && !isIcon(item);
// Logos and vendor icons keep their own colors; only the line icon set takes one.
const HAS_ICON_COLOR = (item: Item) => item.icon.startsWith("lucide:");
const HAS_TEXT = (item: Item) => item.type !== "drawing";
const HAS_SUBTITLE = (item: Item) => ["node", "card", "band"].includes(item.type) && !item.onLine;

/** Named styles, which people and agents share; an item's own look applies over its style. */
function NamedStyle({ editor, item }: ItemProps) {
  const names = [...editor.document.styles.keys()].sort((a, b) => a.localeCompare(b));
  if (!names.length && !item.style) return null;
  return (
    <Section title="Style">
      <select
        aria-label="Named style"
        value={item.style}
        onChange={(event) =>
          editor
            .selected()
            .forEach((selected) =>
              editor.document.patch(selected.id, { style: event.target.value })
            )
        }
      >
        <option value="">None</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </Section>
  );
}

function number(value: number) {
  return Number(value.toPrecision(6));
}

export function Inspector({
  editor,
  author,
}: Readonly<{ editor: EditorController; author: string }>) {
  const selected = editor.selected();
  const item = selected[0];
  const several = selected.length > 1;
  const showText = !several && item && HAS_TEXT(item);
  const textRef = useCollaborativeText(editor.document, showText ? item.id : null);
  if (!item) return null;
  return (
    <aside className="inspector" aria-label="Object properties">
      <header className="inspector-header">
        <strong data-testid="selection-count">
          {several ? `${selected.length} objects` : typeLabel(item)}
        </strong>
        <SelectionActions editor={editor} selected={selected} />
      </header>
      {showText && (
        <textarea ref={textRef} className="object-text" aria-label="Object text" rows={2} />
      )}
      <TopicControls editor={editor} selected={selected} />
      <AlignControls editor={editor} />
      <StyleControls editor={editor} item={item} />
      {!several && <SingleItemControls editor={editor} item={item} author={author} />}
    </aside>
  );
}

/** Controls that only make sense for one item at a time. */
function SingleItemControls({ editor, item, author }: ItemProps & Readonly<{ author: string }>) {
  return (
    <>
      {HAS_SUBTITLE(item) && (
        <input
          className="object-subtitle"
          aria-label="Object subtitle"
          placeholder="Subtitle"
          value={item.subtitle}
          onChange={(event) => editor.document.patch(item.id, { subtitle: event.target.value })}
        />
      )}
      <SlideControls editor={editor} item={item} />
      <PositionControls editor={editor} item={item} />
      <ScreenSizeControl editor={editor} item={item} />
      <CommentControls editor={editor} item={item} author={author} />
    </>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  tone = "",
}: Readonly<
  { label: string; icon: LucideIcon; onClick: () => void } & Partial<{
    disabled: boolean;
    tone: string;
  }>
>) {
  return (
    <button
      className={`icon-action ${tone}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
    </button>
  );
}

function SelectionActions({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  return (
    <div className="selection-actions" role="toolbar" aria-label="Selection actions">
      <ActionButton
        label="Connect"
        icon={Link2}
        onClick={() => editor.connect()}
        disabled={selected.length !== 2}
      />
      <ActionButton
        label="Group"
        icon={Group}
        onClick={() => editor.group()}
        disabled={selected.length < 2}
      />
      <ActionButton
        label="Ungroup"
        icon={Ungroup}
        onClick={() => editor.ungroup()}
        disabled={!selected.some((value) => value.type === "group")}
      />
      <ActionButton label="To front" icon={BringToFront} onClick={() => editor.stack("front")} />
      <ActionButton label="To back" icon={SendToBack} onClick={() => editor.stack("back")} />
      <ActionButton label="Duplicate" icon={Copy} onClick={() => editor.duplicate()} />
      <ActionButton
        label="Delete selection"
        icon={Trash2}
        tone="danger"
        onClick={() => editor.remove()}
      />
    </div>
  );
}

function StyleControls({ editor, item }: ItemProps) {
  const change: ChangeLook = (values) =>
    editor.selected().forEach((selected) => editor.document.patchLook(selected.id, values));
  const drawn = objectStyle(item, editor.document.namedStyle(item.style)) as Record<
    string,
    unknown
  >;
  const props = { item, drawn, change };
  return (
    <>
      <NamedStyle editor={editor} item={item} />
      {HAS_FILL(item) && <FillControls {...props} />}
      {HAS_LINE(item) && <LineControls {...props} />}
      {HAS_ICON_COLOR(item) && (
        <Section title="Icon">
          <ColorChip
            label="Icon color"
            value={item.look.iconColor ?? "#283249"}
            onChange={(color) => change({ iconColor: color })}
          />
        </Section>
      )}
      {HAS_TEXT(item) && <TextControls {...props} />}
    </>
  );
}

function ColorChip({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: unknown; onChange: (color: string) => void }>) {
  const color = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#ffffff";
  return (
    <input
      className="color-chip"
      aria-label={label}
      title={label}
      type="color"
      value={color}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FillControls({ drawn, change }: StyleProps) {
  return (
    <Section title="Fill">
      <div className="control-row">
        {COLORS.map((color, index) => (
          <button
            key={color}
            title={`Fill ${color}`}
            aria-label={`Fill ${color}`}
            className={`swatch swatch-${index}`}
            aria-pressed={drawn.fillColor === color}
            onClick={() => change({ fill: color })}
          />
        ))}
        <ColorChip
          label="Fill color"
          value={drawn.fillColor}
          onChange={(color) => change({ fill: color })}
        />
      </div>
    </Section>
  );
}

function LineControls({ drawn, change }: StyleProps) {
  return (
    <Section title="Line">
      <div className="control-row">
        <ColorChip
          label="Line color"
          value={drawn.strokeColor}
          onChange={(color) => change({ line: color })}
        />
        <NumberField
          prefix="W"
          label="Line width"
          value={Number(drawn.strokeWidth || 1)}
          onChange={(value) => change({ lineWidth: value })}
        />
      </div>
    </Section>
  );
}

function NumberField({
  prefix,
  label,
  value,
  onChange,
}: Readonly<{
  prefix: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="number-field" title={label}>
      <span aria-hidden="true">{prefix}</span>
      <input
        type="number"
        aria-label={label}
        value={number(value)}
        onChange={(event) => {
          if (event.target.value !== "") onChange(Number(event.target.value));
        }}
      />
    </label>
  );
}

const ALIGNMENTS: { value: "left" | "center" | "right"; icon: LucideIcon }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

function TextControls({ drawn, change }: StyleProps) {
  const fontStyle = Number(drawn.fontStyle || 0);
  const align = String(drawn.align || "center");
  const bold = Boolean(fontStyle & 1);
  const italic = Boolean(fontStyle & 2);
  return (
    <Section title="Text">
      <div className="control-row">
        <ColorChip
          label="Text color"
          value={drawn.fontColor}
          onChange={(color) => change({ textColor: color })}
        />
        <NumberField
          prefix="Aa"
          label="Font size"
          value={Number(drawn.fontSize || 14)}
          onChange={(value) => change({ textSize: value })}
        />
        <div className="segmented">
          <button
            aria-label="Bold"
            title="Bold"
            aria-pressed={bold}
            onClick={() => change({ bold: !bold })}
          >
            <Bold size={14} />
          </button>
          <button
            aria-label="Italic"
            title="Italic"
            aria-pressed={italic}
            onClick={() => change({ italic: !italic })}
          >
            <Italic size={14} />
          </button>
        </div>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Text alignment">
        {ALIGNMENTS.map(({ value, icon: Icon }) => (
          <button
            key={value}
            aria-label={`Align ${value}`}
            title={`Align ${value}`}
            aria-pressed={align === value}
            onClick={() => change({ align: value })}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </Section>
  );
}

const GEOMETRY = [
  { key: "x", prefix: "X" },
  { key: "y", prefix: "Y" },
  { key: "width", prefix: "W" },
  { key: "height", prefix: "H" },
] as const;

function GeometryControls({ editor, item }: ItemProps) {
  const locked = isLockedIcon(item) || isSlide(item);
  const setSize = (key: "width" | "height", value: number) => {
    // Vendor icons and slides scale evenly, so either size field sets both.
    const ratio = key === "width" ? item.height / item.width : item.width / item.height;
    const other = key === "width" ? "height" : "width";
    editor.updateGeometry(item.id, { [key]: value, [other]: value * ratio });
  };
  return (
    <Section title="Position and size">
      <div className="geometry-grid">
        {GEOMETRY.map(({ key, prefix }) => (
          <NumberField
            key={key}
            prefix={prefix}
            label={`Object ${key}`}
            value={item[key]}
            onChange={(value) =>
              locked && (key === "width" || key === "height")
                ? setSize(key, value)
                : editor.updateGeometry(item.id, { [key]: value })
            }
          />
        ))}
        {!isFrame(item) && !locked && (
          <NumberField
            prefix="°"
            label="Object rotation"
            value={item.look.rotation ?? 0}
            onChange={(value) => editor.document.patchLook(item.id, { rotation: value })}
          />
        )}
      </div>
    </Section>
  );
}

function PositionControls(props: ItemProps) {
  if (isLink(props.item)) return <ConnectionControls {...props} />;
  if (props.item.type === "drawing") return null;
  return <GeometryControls {...props} />;
}
