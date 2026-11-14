import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { evaluateNumber } from "../editor/arithmetic";
import { unitExpression } from "../document/units";

import type { NumericRules, NumericValue } from "./numericRules";

interface NumericProps {
  label: string;
  value: NumericValue;
  onCommit: (value: number) => void;
  id: string;
  rules: NumericRules;
  /** The field's help sentence, for a field without a `<label>` to carry it. */
  detail: string;
  /** The unit typed values are read in; empty for a plain number. */
  unit: string;
  /** Arithmetic inputs cannot have native spinners; show explicit steppers when needed. */
  steppers: boolean;
}

function parseNumber(source: string, options: NumericProps) {
  if (!source.trim()) return null;
  const normalized = options.unit ? unitExpression(source, options.unit) : source;
  const plain = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized.trim());
  const current = options.value === "mixed" ? 0 : options.value;
  const number =
    options.rules.arithmetic && !plain ? evaluateNumber(normalized, current) : Number(normalized);
  return number !== null && withinRange(number, options.rules) ? number : null;
}

function withinRange(number: number, options: NumericRules) {
  if (!Number.isFinite(number)) return false;
  if (options.positive && number <= 0) return false;
  if (number < options.minimum) return false;
  return !options.integer || Number.isInteger(number);
}

function steppedNumber(text: string, options: NumericProps, key: string, large: boolean) {
  const step = (options.rules.increment === "any" ? 1 : options.rules.increment) * (large ? 10 : 1);
  const direction = key === "ArrowUp" ? 1 : -1;
  const next =
    (parseNumber(text, options) ?? (options.value === "mixed" ? 0 : options.value)) +
    direction * step;
  const rounded = Number(next.toPrecision(12));
  return withinRange(rounded, options.rules) ? rounded : null;
}

function numberError(options: NumericRules) {
  const kind = options.integer ? "whole number" : "number";
  let range = "";
  if (options.positive) range = " greater than 0";
  else if (Number.isFinite(options.minimum)) range = ` of at least ${options.minimum}`;
  const expression = options.arithmetic ? " or a valid arithmetic expression" : "";
  return `Enter a ${kind}${range}${expression}.`;
}

function numberBounds(options: NumericRules) {
  const lowerBound = options.positive ? 0 : undefined;
  const minimum = Number.isFinite(options.minimum) ? options.minimum : lowerBound;
  // Decimal steppers use their authored value as the native step base, retaining finer precision.
  // Domain bounds still validate on completion and remain available to assistive technology.
  return {
    minimum: options.increment === "any" ? minimum : undefined,
    accessibility: options.arithmetic ? {} : { "aria-valuemin": minimum },
  };
}

/** Incomplete drafts stay local; finishing an edit produces one application command. */
function useNumericDraft(options: NumericProps) {
  const shown = options.value === "mixed" ? "" : String(Number(options.value.toPrecision(12)));
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
      setError(numberError(options.rules));
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
      const next = steppedNumber(text, options, event.key, event.shiftKey);
      if (next !== null) change(String(next));
    }
  };
  const blur = () => {
    if (!skipBlur.current) commit();
    skipBlur.current = false;
  };
  const step = (direction: "ArrowUp" | "ArrowDown") => {
    // An invalid draft must not be silently replaced by a stepper click.
    if (draft !== null && parseNumber(draft, options) === null) {
      setError(numberError(options.rules));
      return;
    }
    const next = steppedNumber(text, options, direction, false);
    if (next === null) return;
    if (next !== options.value) options.onCommit(next);
    setDraft(null);
    setError("");
  };
  return {
    error,
    step,
    binding: {
      value: text,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => change(event.target.value),
      onBlur: blur,
      onKeyDown: keydown,
    },
  };
}

/** Native numeric entry, or arithmetic-aware text for canvas coordinates and geometry. */
export function NumericInput(options: Readonly<NumericProps>) {
  const field = useNumericDraft(options);
  const errorId = useId();
  const bounds = numberBounds(options.rules);
  return (
    <>
      <input
        id={options.id || undefined}
        type={options.rules.arithmetic ? "text" : "number"}
        inputMode="decimal"
        min={bounds.minimum}
        step={options.rules.increment}
        {...bounds.accessibility}
        aria-label={options.label}
        data-hint-detail={options.detail}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={field.error ? errorId : undefined}
        placeholder={options.value === "mixed" ? "Mixed" : undefined}
        {...field.binding}
      />
      {options.steppers && (
        <span className="numeric-steppers">
          <button
            type="button"
            aria-label={`Increase ${options.label}`}
            data-hint-detail={`Increase ${options.label} by one ${options.unit || "unit"}.`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => field.step("ArrowUp")}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${options.label}`}
            data-hint-detail={`Decrease ${options.label} by one ${options.unit || "unit"}.`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => field.step("ArrowDown")}
          >
            <ChevronDown size={12} />
          </button>
        </span>
      )}
      {field.error && (
        <span id={errorId} className="field-error" role="status">
          {field.error}
        </span>
      )}
    </>
  );
}
