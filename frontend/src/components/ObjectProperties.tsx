import { useState, type ReactNode } from "react";
import { evaluateNumber } from "../editor/arithmetic";
import { COLORS, type Item, type Look } from "../document/types";
import type { Appearance } from "../document/appearance";
import { canColorIcon, canRotate, hasFill, hasLine, hasText } from "../document/capabilities";
import { Section } from "./ConnectionControls";

type StyleProps = Readonly<{ drawn: Appearance; change: (look: Look) => void }>;

function NamedStyle({
  item,
  names,
  onStyle,
}: Readonly<{ item: Item; names: string[]; onStyle: (style: string) => void }>) {
  if (!names.length && !item.style) return null;
  return (
    <Section title="Style">
      <select
        aria-label="Named style"
        value={item.style}
        onChange={(event) => onStyle(event.target.value)}
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

/** Display-only object controls consume effective values and application commands. */
export function StyleControls({
  item,
  drawn,
  change,
  names,
  onStyle,
  children,
}: StyleProps &
  Readonly<{
    item: Item;
    names: string[];
    onStyle: (style: string) => void;
    children: ReactNode;
  }>) {
  const props = { drawn, change };
  return (
    <>
      <NamedStyle item={item} names={names} onStyle={onStyle} />
      {hasFill(item) && <FillControls {...props} />}
      {hasLine(item) && <LineControls {...props} />}
      {canColorIcon(item) && (
        <Section title="Icon">
          <ColorChip
            label="Icon color"
            value={drawn.iconColor ?? "#283249"}
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
            aria-pressed={drawn.fill === color}
            onClick={() => change({ fill: color })}
          />
        ))}
        <ColorChip
          label="Fill color"
          value={drawn.fill}
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
          value={drawn.line}
          onChange={(color) => change({ line: color })}
        />
        <NumberField
          prefix="W"
          label="Line width"
          value={drawn.lineWidth * drawn.scale || 1}
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
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

function NumberField({
  prefix,
  label,
  value,
  onChange,
}: Readonly<{ prefix: string; label: string; value: number; onChange: (value: number) => void }>) {
  const shown = String(Number(value.toPrecision(6)));
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const commit = () => {
    const next = evaluateNumber(text, value);
    if (next !== null && next !== value) onChange(next);
    else setText(shown);
  };
  // A plain number applies as it is typed; arithmetic waits for Enter or for focus to leave.
  const typed = (next: string) => {
    setText(next);
    if (PLAIN_NUMBER.test(next) && Number(next) !== value) onChange(Number(next));
  };
  return (
    <label className="number-field" title={label}>
      <span aria-hidden="true">{prefix}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text}
        onChange={(event) => typed(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
            onChange(Number((value + step).toPrecision(6)));
          }
        }}
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
