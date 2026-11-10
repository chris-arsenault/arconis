import type { ReactNode } from "react";
import { COLORS, type Item, type Look } from "../document/types";
import type { Appearance } from "../document/appearance";
import { canColorIcon, canRotate, hasFill, hasLine, hasText } from "../document/capabilities";
import { Section } from "./ConnectionControls";
import { NumericInput } from "./NumericInput";

type StyleProps = Readonly<{
  drawn: Appearance;
  appearances?: Appearance[];
  change: (look: Look) => void;
}>;

function isMixed(appearances: Appearance[] | undefined, key: keyof Appearance) {
  return appearances?.some((appearance) => appearance[key] !== appearances[0][key]) ?? false;
}

function NamedStyle({
  item,
  names,
  onStyle,
  mixed = false,
}: Readonly<{ item: Item; names: string[]; onStyle: (style: string) => void; mixed?: boolean }>) {
  if (!names.length && !item.style) return null;
  return (
    <Section title="Style">
      <select
        aria-label="Named style"
        data-hint-detail="Draw the selection with a style this canvas defines; each object's own settings still win."
        value={mixed ? "__mixed__" : item.style}
        onChange={(event) => onStyle(event.target.value)}
      >
        {mixed && (
          <option value="__mixed__" disabled>
            Mixed styles
          </option>
        )}
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

/** Display-only object controls consume effective values and application commands. */
export function StyleControls({
  item,
  drawn,
  change,
  names,
  onStyle,
  children,
  appearances,
  mixedStyle = false,
}: StyleProps &
  Readonly<{
    item: Item;
    names: string[];
    onStyle: (style: string) => void;
    children: ReactNode;
    mixedStyle?: boolean;
  }>) {
  const props = { drawn, appearances, change };
  return (
    <>
      <NamedStyle item={item} names={names} onStyle={onStyle} mixed={mixedStyle} />
      {hasFill(item) && <FillControls {...props} />}
      {hasLine(item) && <LineControls {...props} />}
      {canColorIcon(item) && (
        <Section title="Icon">
          <ColorChip
            label="Icon color"
            detail="Recolor the icon drawn on the selected objects."
            value={drawn.iconColor ?? "#283249"}
            mixed={isMixed(appearances, "iconColor")}
            onChange={(color) => change({ iconColor: color })}
          />
        </Section>
      )}
      {hasText(item) && children}
    </>
  );
}

function ColorChip({
  label,
  detail,
  value,
  onChange,
  mixed = false,
}: Readonly<{
  label: string;
  detail: string;
  value: unknown;
  onChange: (color: string) => void;
  mixed?: boolean;
}>) {
  const color = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#ffffff";
  return (
    <>
      <input
        className="color-chip"
        aria-label={label}
        data-hint={label}
        type="color"
        value={color}
        data-hint-detail={detail}
        data-tip={mixed ? "The selected objects use different colors" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {mixed && <span className="mixed-color-label">Mixed</span>}
    </>
  );
}

function FillControls({ drawn, appearances, change }: StyleProps) {
  const mixed = isMixed(appearances, "fill");
  return (
    <Section title="Fill">
      <div className="control-row">
        {COLORS.map((color, index) => (
          <button
            key={color}
            data-hint={`Fill ${color}`}
            aria-label={`Fill ${color}`}
            data-hint-detail="Fill the selection with this color."
            className={`swatch swatch-${index}`}
            aria-pressed={!mixed && drawn.fill === color}
            onClick={() => change({ fill: color })}
          />
        ))}
        <ColorChip
          label="Fill color"
          detail="Pick any fill color for the selected objects."
          value={drawn.fill}
          mixed={mixed}
          onChange={(color) => change({ fill: color })}
        />
      </div>
    </Section>
  );
}

function LineControls({ drawn, appearances, change }: StyleProps) {
  const widths = appearances?.map((appearance) => appearance.lineWidth * appearance.scale);
  const mixedWidth = widths?.some((width) => width !== widths[0]) ?? false;
  return (
    <Section title="Line">
      <div className="control-row">
        <ColorChip
          label="Line color"
          detail="Color the lines and outlines of the selected objects."
          value={drawn.line}
          mixed={isMixed(appearances, "line")}
          onChange={(color) => change({ line: color })}
        />
        <NumberField
          prefix="W"
          label="Line width"
          value={mixedWidth ? undefined : drawn.lineWidth * drawn.scale}
          minimum={0}
          onChange={(value) => change({ lineWidth: value / drawn.scale })}
        />
      </div>
    </Section>
  );
}

/**
 * A number field that applies on Enter or when left, takes arithmetic, and steps by one with the
 * arrows and ten with Shift.
 */
function NumberField({
  prefix,
  label,
  value,
  onChange,
  minimum,
  positive,
}: Readonly<{
  prefix: string;
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  minimum?: number;
  positive?: boolean;
}>) {
  return (
    <label
      className="number-field"
      data-hint={label}
      data-hint-detail="Type a value or sum like 200+40; a leading +10 or *2 changes the current value."
    >
      <span aria-hidden="true">{prefix}</span>
      <NumericInput
        label={label}
        value={value}
        minimum={minimum}
        positive={positive}
        arithmetic
        onCommit={onChange}
      />
    </label>
  );
}

const GEOMETRY = [
  { key: "x", prefix: "X" },
  { key: "y", prefix: "Y" },
  { key: "width", prefix: "W" },
  { key: "height", prefix: "H" },
] as const;

export function GeometryControls({
  item,
  rotation,
  onGeometry,
  onRotate,
}: Readonly<{
  item: Item;
  rotation: number;
  onGeometry: (key: "x" | "y" | "width" | "height", value: number) => void;
  onRotate: (value: number) => void;
}>) {
  return (
    <Section title="Position and size">
      <div className="geometry-grid">
        {GEOMETRY.map(({ key, prefix }) => (
          <NumberField
            key={key}
            prefix={prefix}
            label={`Object ${key}`}
            value={item[key]}
            positive={key === "width" || key === "height"}
            onChange={(value) => onGeometry(key, value)}
          />
        ))}
        {canRotate(item) && (
          <NumberField prefix="°" label="Object rotation" value={rotation} onChange={onRotate} />
        )}
      </div>
    </Section>
  );
}
