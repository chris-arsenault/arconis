import {
  type Align,
  type Item,
  type Look,
  type TextFont,
  type VerticalAlign,
} from "../document/types";
import type { Appearance } from "../document/appearance";
import { TEXT_FONTS } from "../text/typography";
import { textCanResize } from "../document/capabilities";
import { Section } from "./ConnectionControls";
import type { ReactNode } from "react";

function common<T>(values: T[]): T | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

/** Controls are box defaults. Markdown owns its own semantic inline formatting. */
export function TextProperties({
  selected,
  drawn,
  change,
  onFit,
}: Readonly<{
  selected: Item[];
  drawn: Appearance[];
  change: (look: Look) => void;
  onFit: () => void;
}>) {
  const value = (key: keyof Appearance, fallback: unknown) =>
    common(drawn.map((style) => style[key] ?? fallback));
  return (
    <Section title="Text">
      <div className="text-box-controls" data-text-tools="true">
        <div className="text-box-main">
          <FontControl value={value("font", "sans")} change={change} />
          <label>
            <input
              type="number"
              min="1"
              aria-label="Font size"
              placeholder="Mixed"
              value={String(value("textSize", 14) ?? "")}
              onChange={(event) => {
                const n = Number(event.target.value);
                if (n > 0) change({ textSize: n });
              }}
            />
          </label>
          <label>
            <input
              type="color"
              aria-label="Text color"
              value={String(value("textColor", "#283249") ?? "#283249")}
              onChange={(event) => change({ textColor: event.target.value })}
            />
            {value("textColor", "#283249") === undefined && "Mixed"}
          </label>
        </div>
        <TextToggles drawn={drawn} change={change} />
        <TextPosition
          align={value("align", "center")}
          valign={value("valign", "middle")}
          change={change}
        />
        <SpacingControls value={value} change={change}>
          <TextSizing selected={selected} drawn={drawn} change={change} onFit={onFit} />
        </SpacingControls>
      </div>
    </Section>
  );
}

function SpacingControls({
  value,
  change,
  children,
}: Readonly<{
  value: (key: keyof Appearance, fallback: unknown) => unknown;
  change: (look: Look) => void;
  children: ReactNode;
}>) {
  return (
    <details>
      <summary>Spacing and sizing</summary>
      <div className="text-box-controls">
        <NumericLook
          label="Line height"
          value={value("lineHeight", 1.35)}
          property="lineHeight"
          positive
          change={change}
        />
        <NumericLook
          label="Paragraph spacing"
          value={value("paragraphGap", 0.5)}
          property="paragraphGap"
          positive={false}
          change={change}
        />
        <NumericLook
          label="Text padding"
          value={value("padding", 14)}
          property="padding"
          positive={false}
          change={change}
        />
        <label>
          Highlight{" "}
          <input
            type="color"
            aria-label="Text highlight"
            value={String(value("textHighlight", "#fff0ad") ?? "#fff0ad")}
            onChange={(event) => change({ textHighlight: event.target.value })}
          />
        </label>
        <button type="button" onClick={() => change({ textHighlight: undefined })}>
          Clear text highlight
        </button>
        {children}
      </div>
    </details>
  );
}

function FontControl({
  value,
  change,
}: Readonly<{ value: unknown; change: (look: Look) => void }>) {
  const font = (Object.keys(TEXT_FONTS) as TextFont[]).find((key) => key === value);
  return (
    <label>
      <select
        aria-label="Text font"
        value={font ?? ""}
        onChange={(event) => change({ font: event.target.value as TextFont })}
      >
        {font === undefined && <option value="">Mixed</option>}
        <option value="sans">Sans · Inter</option>
        <option value="serif">Serif · Source Serif 4</option>
        <option value="mono">Mono · Source Code Pro</option>
      </select>
    </label>
  );
}

const TOGGLES = [
  { key: "bold", label: "Bold" },
  { key: "italic", label: "Italic" },
  { key: "underline", label: "Underline" },
  { key: "strike", label: "Strikethrough" },
] as const;
function TextToggles({
  drawn,
  change,
}: Readonly<{ drawn: Appearance[]; change: (look: Look) => void }>) {
  return (
    <div className="text-box-toggles">
      {TOGGLES.map(({ key, label }) => {
        const on = common(drawn.map((style) => style[key]));
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={on ?? "mixed"}
            onClick={() => change({ [key]: !on })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TextPosition({
  align,
  valign,
  change,
}: Readonly<{ align: unknown; valign: unknown; change: (look: Look) => void }>) {
  const current =
    typeof align === "string" && typeof valign === "string" ? `${valign}-${align}` : "";
  return (
    <select
      aria-label="Text position"
      value={current}
      onChange={(event) => {
        const [vertical, horizontal] = event.target.value.split("-") as [VerticalAlign, Align];
        change({ align: horizontal, valign: vertical });
      }}
    >
      {!current && <option value="">Mixed position</option>}
      {(["top", "middle", "bottom"] as VerticalAlign[]).flatMap((vertical) =>
        (["left", "center", "right"] as Align[]).map((horizontal) => (
          <option key={`${vertical}-${horizontal}`} value={`${vertical}-${horizontal}`}>
            {vertical} {horizontal}
          </option>
        ))
      )}
    </select>
  );
}

function NumericLook({
  label,
  value,
  property,
  positive,
  change,
}: Readonly<{
  label: string;
  value: unknown;
  property: "lineHeight" | "paragraphGap" | "padding";
  positive: boolean;
  change: (look: Look) => void;
}>) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="0.1"
        min={positive ? 0.1 : 0}
        aria-label={label}
        value={String(value ?? "")}
        placeholder="Mixed"
        onChange={(event) => {
          if (!event.target.value) return;
          const n = Number(event.target.value);
          if (Number.isFinite(n) && (positive ? n > 0 : n >= 0)) change({ [property]: n });
        }}
      />
    </label>
  );
}

function TextSizing({
  selected,
  drawn,
  change,
  onFit,
}: Readonly<{
  selected: Item[];
  drawn: Appearance[];
  change: (look: Look) => void;
  onFit: () => void;
}>) {
  const growing = common(drawn.map((look) => look.textFit === "height"));
  return (
    <>
      {selected.every((item) => item.type === "text") && (
        <label>
          <input
            type="checkbox"
            aria-label="Grow text height"
            checked={Boolean(growing)}
            onChange={(event) => change({ textFit: event.target.checked ? "height" : "fixed" })}
          />
          Grow height with text
        </label>
      )}
      {selected.every(textCanResize) && (
        <button type="button" onClick={onFit}>
          Fit to text
        </button>
      )}
    </>
  );
}
