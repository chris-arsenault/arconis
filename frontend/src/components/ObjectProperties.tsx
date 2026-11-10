import type { ReactNode } from "react";
import { COLORS, type Item, type Look } from "../document/types";
import type { Appearance } from "../document/appearance";
import { canColorIcon, canRotate, hasFill, hasLine, hasText } from "../document/capabilities";
import { Section } from "./ConnectionControls";
import { NumericInput } from "./NumericInput";
import {
  LINE_WIDTH_NUMBER,
  GEOMETRY_NUMBER,
  SIZE_NUMBER,
  type NumericRules,
  type NumericValue,
} from "./numericRules";

type StyleProps = Readonly<{
  drawn: Appearance;
  appearances: Appearance[];
  change: (look: Look) => void;
}>;

function isMixed(appearances: Appearance[], key: keyof Appearance) {
  return appearances.some((appearance) => appearance[key] !== appearances[0][key]);
}

function NamedStyle({
  item,
  names,
  onStyle,
  mixed,
}: Readonly<{ item: Item; names: string[]; onStyle: (style: string) => void; mixed: boolean }>) {
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
  mixedStyle,
  paint,
}: StyleProps &
  Readonly<{
    item: Item;
    names: string[];
    onStyle: (style: string) => void;
    children: ReactNode;
    mixedStyle: boolean;
    /** Paint controls of the selection's own kind, shown in place of the general fill and line. */
    paint: ReactNode;
  }>) {
  const props = { drawn, appearances, change };
  return (
    <>
      <NamedStyle item={item} names={names} onStyle={onStyle} mixed={mixedStyle} />
      {paint}
      {!paint && hasFill(item) && <FillControls {...props} />}
      {!paint && hasLine(item) && <LineControls {...props} />}
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
  mixed,
}: Readonly<{
  label: string;
  detail: string;
  value: unknown;
  onChange: (color: string) => void;
  mixed: boolean;
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
  const widths = appearances.map((appearance) => appearance.lineWidth * appearance.scale);
  const mixedWidth = widths.some((width) => width !== widths[0]);
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
          value={mixedWidth ? "mixed" : drawn.lineWidth * drawn.scale}
          rules={LINE_WIDTH_NUMBER}
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
  rules,
  unit = "",
}: Readonly<{
  prefix: string;
  label: string;
  value: NumericValue;
  onChange: (value: number) => void;
  rules: NumericRules;
  unit?: string;
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
        rules={rules}
        id=""
        detail="Type a value or sum like 200+40; a leading +10 or *2 changes the current value."
        onCommit={onChange}
        unit={unit}
      />
      {unit && <small>{unit}</small>}
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
  factor,
  unit,
}: Readonly<{
  item: Item;
  rotation: number;
  onGeometry: (key: "x" | "y" | "width" | "height", value: number) => void;
  onRotate: (value: number) => void;
  factor: number;
  unit: string;
}>) {
  return (
    <Section title="Position and size">
      <div className="geometry-grid">
        {GEOMETRY.map(({ key, prefix }) => (
          <NumberField
            key={key}
            prefix={prefix}
            label={`Object ${key}`}
            value={item[key] * factor}
            unit={unit === "u" ? "" : unit}
            rules={key === "width" || key === "height" ? SIZE_NUMBER : GEOMETRY_NUMBER}
            onChange={(value) => onGeometry(key, value / factor)}
          />
        ))}
        {canRotate(item) && (
          <NumberField
            prefix="°"
            label="Object rotation"
            value={rotation}
            rules={GEOMETRY_NUMBER}
            onChange={onRotate}
          />
        )}
      </div>
    </Section>
  );
}
