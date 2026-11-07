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
import { COLORS, KIND_LABELS, type CanvasObject, type StyleValue } from "../document/types";
import { useCollaborativeText } from "../document/useCollaborativeText";
import { isContainerKind, isLockedIcon } from "../document/geometry";
import { objectStyle } from "../editor/styles";
import { ConnectionControls, Section } from "./ConnectionControls";

type ItemProps = Readonly<{ editor: EditorController; item: CanvasObject }>;
type ChangeStyle = (key: string, value: StyleValue) => void;
type StyleProps = Readonly<{ item: CanvasObject; change: ChangeStyle }>;

const HAS_FILL = (item: CanvasObject) =>
  !["connector", "stroke", "text", "icon"].includes(item.kind);
const HAS_LINE = (item: CanvasObject) => !["sticky", "text", "icon"].includes(item.kind);
// Logos and vendor icons keep their own colors; only the line icon set takes one.
const HAS_ICON_COLOR = (item: CanvasObject) =>
  item.kind === "icon" && String(item.style.icon).startsWith("lucide:");
const HAS_TEXT = (item: CanvasObject) => item.kind !== "stroke";

function effectiveStyle(item: CanvasObject) {
  return objectStyle(item) as Record<string, StyleValue | undefined>;
}

function number(value: number) {
  return Number(value.toPrecision(6));
}

export function Inspector({ editor }: Readonly<{ editor: EditorController }>) {
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
          {several ? `${selected.length} objects` : KIND_LABELS[item.kind]}
        </strong>
        <SelectionActions editor={editor} selected={selected} />
      </header>
      {showText && (
        <textarea ref={textRef} className="object-text" aria-label="Object text" rows={2} />
      )}
      <StyleControls editor={editor} item={item} />
      {!several && <PositionControls editor={editor} item={item} />}
    </aside>
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
}: Readonly<{ editor: EditorController; selected: CanvasObject[] }>) {
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
        disabled={!selected.some((value) => value.kind === "group")}
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
  const change: ChangeStyle = (key, value) =>
    editor
      .selected()
      .forEach((selected) => editor.document.patchStyle(selected.id, { [key]: value }));
  return (
    <>
      {HAS_FILL(item) && <FillControls item={item} change={change} />}
      {HAS_LINE(item) && <LineControls item={item} change={change} />}
      {HAS_ICON_COLOR(item) && (
        <Section title="Icon">
          <ColorChip
            label="Icon color"
            value={item.style.iconColor ?? "#283249"}
            onChange={(color) => change("iconColor", color)}
          />
        </Section>
      )}
      {HAS_TEXT(item) && <TextControls item={item} change={change} />}
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

function FillControls({ item, change }: StyleProps) {
  const style = effectiveStyle(item);
  return (
    <Section title="Fill">
      <div className="control-row">
        {COLORS.map((color, index) => (
          <button
            key={color}
            title={`Fill ${color}`}
            aria-label={`Fill ${color}`}
            className={`swatch swatch-${index}`}
            aria-pressed={style.fillColor === color}
            onClick={() => change("fillColor", color)}
          />
        ))}
        <ColorChip
          label="Fill color"
          value={style.fillColor}
          onChange={(color) => change("fillColor", color)}
        />
      </div>
    </Section>
  );
}

function LineControls({ item, change }: StyleProps) {
  const style = effectiveStyle(item);
  return (
    <Section title="Line">
      <div className="control-row">
        <ColorChip
          label="Line color"
          value={style.strokeColor}
          onChange={(color) => change("strokeColor", color)}
        />
        <NumberField
          prefix="W"
          label="Line width"
          value={Number(style.strokeWidth || 1)}
          onChange={(value) => change("strokeWidth", value)}
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

const ALIGNMENTS: { value: string; icon: LucideIcon }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

function TextControls({ item, change }: StyleProps) {
  const style = effectiveStyle(item);
  const fontStyle = Number(style.fontStyle || 0);
  const align = String(style.align || "center");
  return (
    <Section title="Text">
      <div className="control-row">
        <ColorChip
          label="Text color"
          value={style.fontColor}
          onChange={(color) => change("fontColor", color)}
        />
        <NumberField
          prefix="Aa"
          label="Font size"
          value={Number(style.fontSize || 14)}
          onChange={(value) => change("fontSize", value)}
        />
        <div className="segmented">
          <button
            aria-label="Bold"
            title="Bold"
            aria-pressed={Boolean(fontStyle & 1)}
            onClick={() => change("fontStyle", fontStyle ^ 1)}
          >
            <Bold size={14} />
          </button>
          <button
            aria-label="Italic"
            title="Italic"
            aria-pressed={Boolean(fontStyle & 2)}
            onClick={() => change("fontStyle", fontStyle ^ 2)}
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
            onClick={() => change("align", value)}
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
  const locked = isLockedIcon(item.style);
  const setSize = (key: "width" | "height", value: number) => {
    // Vendor icons scale evenly, so either size field sets both.
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
        {!isContainerKind(item.kind) && !locked && (
          <NumberField
            prefix="°"
            label="Object rotation"
            value={Number(item.style.rotation || 0)}
            onChange={(value) => editor.document.patchStyle(item.id, { rotation: value })}
          />
        )}
      </div>
    </Section>
  );
}

function PositionControls(props: ItemProps) {
  if (props.item.kind === "connector") return <ConnectionControls {...props} />;
  if (props.item.kind === "stroke") return null;
  return <GeometryControls {...props} />;
}
