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
import { useId, type ReactNode } from "react";
import { NumericInput } from "./NumericInput";
import { POSITIVE_NUMBER, TEXT_SPACING } from "./numericRules";

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
  const fontId = useId();
  const value = <Key extends keyof Appearance>(key: Key) =>
    common(drawn.map((style) => style[key]));
  return (
    <Section title="Text">
      <div className="text-box-controls" data-text-tools="true">
        <div className="text-box-main">
          <FontControl value={value("font")} change={change} />
          <label
            htmlFor={fontId}
            data-hint-detail="Set the text size for the selected objects; arrow keys step it by 1."
          >
            <NumericInput
              id={fontId}
              label="Font size"
              rules={POSITIVE_NUMBER}
              detail="Set the text size for the selected objects; arrow keys step it by 1."
              value={common(drawn.map((style) => style.textSize)) ?? "mixed"}
              onCommit={(textSize) => change({ textSize })}
              unit=""
            />
          </label>
          <label>
            <input
              type="color"
              aria-label="Text color"
              data-hint-detail="Color all the text in the selected objects."
              value={value("textColor") ?? "#283249"}
              onChange={(event) => change({ textColor: event.target.value })}
            />
            {value("textColor") === undefined && "Mixed"}
          </label>
        </div>
        <TextToggles drawn={drawn} change={change} />
        <TextPosition align={value("align")} valign={value("valign")} change={change} />
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
  value: <Key extends keyof Appearance>(key: Key) => Appearance[Key] | undefined;
  change: (look: Look) => void;
  children: ReactNode;
}>) {
  return (
    <details>
      <summary data-hint-detail="Show line height, paragraph spacing, padding and text highlight settings.">
        Spacing and sizing
      </summary>
      <div className="text-box-controls">
        <NumericLook
          label="Line height"
          detail="Set the distance between lines as a multiple of the text size."
          value={value("lineHeight")}
          property="lineHeight"
          change={change}
        />
        <NumericLook
          label="Paragraph spacing"
          detail="Set the extra gap between paragraphs, in multiples of the text size."
          value={value("paragraphGap")}
          property="paragraphGap"
          change={change}
        />
        <NumericLook
          label="Text padding"
          detail="Set the space between the text and the edges of its object."
          value={value("padding")}
          property="padding"
          change={change}
        />
        <label>
          Highlight{" "}
          <input
            type="color"
            aria-label="Text highlight"
            data-hint-detail="Paint a background color behind the text of the selected objects."
            value={value("textHighlight") ?? "#fff0ad"}
            onChange={(event) => change({ textHighlight: event.target.value })}
          />
        </label>
        <button
          type="button"
          data-hint-detail="Remove the background color behind the text."
          onClick={() => change({ textHighlight: undefined })}
        >
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
        data-hint-detail="Set the typeface for all the text in the selected objects."
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
            data-hint-detail="Turn this style on or off for all the text in the selected objects."
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
      data-hint-detail="Place the text within its object, from top left to bottom right."
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
  detail,
  value,
  property,
  change,
}: Readonly<{
  label: string;
  detail: string;
  value: unknown;
  property: "lineHeight" | "paragraphGap" | "padding";
  change: (look: Look) => void;
}>) {
  const unit = { lineHeight: "×", paragraphGap: "em", padding: "units" }[property];
  const inputId = useId();
  return (
    <label htmlFor={inputId} data-hint-detail={detail}>
      {label} <small>{unit}</small>
      <NumericInput
        id={inputId}
        label={label}
        detail={detail}
        rules={TEXT_SPACING[property]}
        value={typeof value === "number" ? value : "mixed"}
        onCommit={(number) => change({ [property]: number })}
        unit=""
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
            data-hint-detail="Keep the text box exactly as tall as its text while anyone types."
            checked={Boolean(growing)}
            onChange={(event) => change({ textFit: event.target.checked ? "height" : "fixed" })}
          />
          Grow height with text
        </label>
      )}
      {selected.every(textCanResize) && (
        <button
          type="button"
          data-hint-detail="Change each selected object's height to match its text."
          onClick={onFit}
        >
          Fit to text
        </button>
      )}
    </>
  );
}
