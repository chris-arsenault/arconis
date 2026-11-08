import type { EditorController } from "../editor/controller";
import {
  LOCAL,
  type Align,
  type Item,
  type Look,
  type TextFont,
  type VerticalAlign,
} from "../document/types";
import { objectStyle, resolvedLook } from "../editor/styles";
import { TEXT_FONTS } from "../text/typography";
import { fitText, textCanResize } from "../editor/textLayout";
import { Section } from "./ConnectionControls";
import type { ReactNode } from "react";

type Drawn = Record<string, unknown>;

function common<T>(values: T[]): T | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

/** Controls are box defaults. Markdown owns its own semantic inline formatting. */
export function TextProperties({ editor }: Readonly<{ editor: EditorController }>) {
  const selected = editor.selected().filter((item) => item.type !== "drawing");
  const drawn: Drawn[] = selected.map((item) => {
    const named = editor.document.namedStyle(item.style);
    const scale = resolvedLook(item, named).scale ?? 1;
    const style = objectStyle(item, named) as Drawn;
    return {
      ...style,
      fontSize: Number(style.fontSize ?? 14) / scale,
      spacing: Number(style.spacing ?? 14) / scale,
    };
  });
  const value = (key: string, fallback: unknown) =>
    common(drawn.map((style) => style[key] ?? fallback));
  const change = (look: Look) => {
    editor.document.undo.stopCapturing();
    editor.document.doc.transact(
      () => selected.forEach((item) => editor.document.patchLook(item.id, look)),
      LOCAL
    );
    editor.document.undo.stopCapturing();
    selected.forEach((item) => void fitText(editor, item.id, true));
  };
  return (
    <Section title="Text">
      <div className="text-box-controls" data-text-tools="true">
        <div className="text-box-main">
          <FontControl value={value("fontFamily", TEXT_FONTS.sans)} change={change} />
          <label>
            <input
              type="number"
              min="1"
              aria-label="Font size"
              placeholder="Mixed"
              value={String(value("fontSize", 14) ?? "")}
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
              value={String(value("fontColor", "#283249") ?? "#283249")}
              onChange={(event) => change({ textColor: event.target.value })}
            />
            {value("fontColor", "#283249") === undefined && "Mixed"}
          </label>
        </div>
        <TextToggles drawn={drawn} change={change} />
        <TextPosition
          align={value("align", "center")}
          valign={value("verticalAlign", "middle")}
          change={change}
        />
        <SpacingControls value={value} change={change}>
          <TextSizing editor={editor} selected={selected} change={change} />
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
  value: (key: string, fallback: unknown) => unknown;
  change: (look: Look) => void;
  children: ReactNode;
}>) {
  return (
    <details>
      <summary>Spacing and sizing</summary>
      <div className="text-box-controls">
        <NumericLook
          label="Line height"
          value={value("labelLineHeight", 1.35)}
          property="lineHeight"
          positive
          change={change}
        />
        <NumericLook
          label="Paragraph spacing"
          value={value("labelParagraphGap", 0.5)}
          property="paragraphGap"
          change={change}
        />
        <NumericLook
          label="Text padding"
          value={value("spacing", 14)}
          property="padding"
          change={change}
        />
        <label>
          Highlight{" "}
          <input
            type="color"
            aria-label="Text highlight"
            value={String(value("labelHighlight", "#fff0ad") ?? "#fff0ad")}
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
  const font = (Object.keys(TEXT_FONTS) as TextFont[]).find((key) => TEXT_FONTS[key] === value);
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
  { key: "bold", bit: 1, label: "Bold" },
  { key: "italic", bit: 2, label: "Italic" },
  { key: "underline", bit: 4, label: "Underline" },
  { key: "strike", bit: 8, label: "Strikethrough" },
] as const;
function TextToggles({
  drawn,
  change,
}: Readonly<{ drawn: Drawn[]; change: (look: Look) => void }>) {
  return (
    <div className="text-box-toggles">
      {TOGGLES.map(({ key, bit, label }) => {
        const on = common(drawn.map((style) => Boolean(Number(style.fontStyle ?? 0) & bit)));
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
  positive = false,
  change,
}: Readonly<{
  label: string;
  value: unknown;
  property: "lineHeight" | "paragraphGap" | "padding";
  positive?: boolean;
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
  editor,
  selected,
  change,
}: Readonly<{ editor: EditorController; selected: Item[]; change: (look: Look) => void }>) {
  const growing = common(selected.map((item) => item.look.textFit === "height"));
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
        <button
          type="button"
          onClick={() => selected.forEach((item) => void fitText(editor, item.id))}
        >
          Fit to text
        </button>
      )}
    </>
  );
}
