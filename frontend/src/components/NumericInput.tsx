import { useId, useRef, useState, type KeyboardEvent } from "react";
import { evaluateNumber } from "../editor/arithmetic";

interface NumericProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  id?: string;
  minimum?: number;
  positive?: boolean;
  integer?: boolean;
  increment?: number;
  arithmetic?: boolean;
}

function parseNumber(source: string, options: NumericProps) {
  if (!source.trim()) return null;
  const plain = /^-?\d+(?:\.\d*)?$|^-?\.\d+$/.test(source.trim());
  const number =
    options.arithmetic && !plain ? evaluateNumber(source, options.value ?? 0) : Number(source);
  return number !== null && withinRange(number, options) ? number : null;
}

function withinRange(number: number, options: NumericProps) {
  if (!Number.isFinite(number)) return false;
  if (options.positive && number <= 0) return false;
  if (options.minimum !== undefined && number < options.minimum) return false;
  return !options.integer || Number.isInteger(number);
}

function steppedNumber(text: string, options: NumericProps, key: string, large: boolean) {
  const step = (options.increment ?? 1) * (large ? 10 : 1);
  const direction = key === "ArrowUp" ? 1 : -1;
  const next = (parseNumber(text, options) ?? options.value ?? 0) + direction * step;
  return String(Number(next.toPrecision(12)));
}

function numberError(options: NumericProps) {
  const kind = options.integer ? "whole number" : "number";
  let range = "";
  if (options.positive) range = " greater than 0";
  else if (options.minimum !== undefined) range = ` of at least ${options.minimum}`;
  const expression = options.arithmetic ? " or a valid arithmetic expression" : "";
  return `Enter a ${kind}${range}${expression}.`;
}

function numberBounds(options: NumericProps) {
  const minimum = options.minimum ?? (options.positive ? 0 : undefined);
  // Decimal steppers use their authored value as the native step base, retaining finer precision.
  // Domain bounds still validate on completion and remain available to assistive technology.
  return {
    minimum: options.increment === undefined ? minimum : undefined,
    accessibility: options.arithmetic ? {} : { "aria-valuemin": minimum },
  };
}

/** Incomplete drafts stay local; finishing an edit produces one application command. */
function useNumericDraft(options: NumericProps) {
  const shown = options.value === undefined ? "" : String(Number(options.value.toPrecision(12)));
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const skipBlur = useRef(false);
  const text = draft ?? shown;
  const change = (next: string | null) => {
    setDraft(next);
    setError("");
  };
  const commit = () => {
    if (draft === null) return true;
    const number = parseNumber(draft, options);
    if (number === null) {
      setError(numberError(options));
      return false;
    }
    if (number !== options.value) options.onCommit(number);
    setDraft(null);
    setError("");
    return true;
  };
  const keydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (["Escape", "Enter"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") change(null);
      else if (!commit()) return;
      skipBlur.current = true;
      event.currentTarget.blur();
    } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      change(steppedNumber(text, options, event.key, event.shiftKey));
    }
  };
  const blur = () => {
    if (!skipBlur.current) commit();
    skipBlur.current = false;
  };
  return { text, error, change, blur, keydown };
}

/** Native numeric entry, or arithmetic-aware text for canvas coordinates and geometry. */
export function NumericInput(options: Readonly<NumericProps>) {
  const field = useNumericDraft(options);
  const errorId = useId();
  const bounds = numberBounds(options);
  return (
    <>
      <input
        id={options.id}
        type={options.arithmetic ? "text" : "number"}
        inputMode="decimal"
        min={bounds.minimum}
        step={options.increment ?? "any"}
        {...bounds.accessibility}
        aria-label={options.label}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={field.error ? errorId : undefined}
        placeholder={options.value === undefined ? "Mixed" : undefined}
        value={field.text}
        onChange={(event) => field.change(event.target.value)}
        onBlur={field.blur}
        onKeyDown={field.keydown}
      />
      {field.error && (
        <span id={errorId} className="field-error" role="status">
          {field.error}
        </span>
      )}
    </>
  );
}
