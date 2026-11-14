import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { Arrow } from "../document/types";
import { ARROW_GROUPS, arrowLabel } from "./arrowChoices";
import "./arrowPicker.css";

/** The end's strokes in a 40 by 16 box, the line arriving from the left at x 36. */
const HEADS: Record<Arrow, { line: string; marks: ReactNode }> = {
  none: { line: "M4 8H36", marks: null },
  arrow: { line: "M4 8H26", marks: <path d="M36 8L26 3V13Z" className="filled" /> },
  open: { line: "M4 8H36", marks: <path d="M27 3L36 8L27 13" /> },
  classic: { line: "M4 8H29", marks: <path d="M36 8L26 3L29 8L26 13Z" className="filled" /> },
  thin: { line: "M4 8H26", marks: <path d="M36 8L26 5V11Z" className="filled" /> },
  triangle: { line: "M4 8H26", marks: <path d="M36 8L26 3V13Z" /> },
  dot: { line: "M4 8H28", marks: <circle cx="32" cy="8" r="4" className="filled" /> },
  circle: { line: "M4 8H28", marks: <circle cx="32" cy="8" r="4" /> },
  diamond: { line: "M4 8H26", marks: <path d="M36 8L31 4L26 8L31 12Z" className="filled" /> },
  "hollow-diamond": { line: "M4 8H26", marks: <path d="M36 8L31 4L26 8L31 12Z" /> },
  bar: { line: "M4 8H36", marks: <path d="M32 3V13" /> },
  cross: { line: "M4 8H36", marks: <path d="M28 4L36 12M28 12L36 4" /> },
  one: { line: "M4 8H36", marks: <path d="M31 3V13" /> },
  "only-one": { line: "M4 8H36", marks: <path d="M32 3V13M27 3V13" /> },
  many: { line: "M4 8H28", marks: <path d="M28 8L36 3M28 8H36M28 8L36 13" /> },
  "one-or-many": {
    line: "M4 8H28",
    marks: <path d="M28 8L36 3M28 8H36M28 8L36 13M24 3V13" />,
  },
  "zero-or-one": {
    line: "M4 8H19M25 8H36",
    marks: (
      <>
        <path d="M31 3V13" />
        <circle cx="22" cy="8" r="3" />
      </>
    ),
  },
  "zero-or-many": {
    line: "M4 8H18M24 8H28",
    marks: (
      <>
        <path d="M28 8L36 3M28 8H36M28 8L36 13" />
        <circle cx="21" cy="8" r="3" />
      </>
    ),
  },
};

/** A picture of a line end; a start end is drawn facing left. */
export function ArrowGlyph({ arrow, start }: Readonly<{ arrow: Arrow; start: boolean }>) {
  const head = HEADS[arrow] ?? HEADS.none;
  return (
    <svg className="arrow-glyph" viewBox="0 0 40 16" width="40" height="16" aria-hidden="true">
      <g transform={start ? "matrix(-1 0 0 1 40 0)" : undefined}>
        <path d={head.line} />
        {head.marks}
      </g>
    </svg>
  );
}

/**
 * One end's head, chosen from glyphs. The menu closes on a choice, on Escape or on a press
 * outside it.
 */
export function ArrowPicker({
  label,
  detail,
  value,
  start,
  onChange,
}: Readonly<{
  label: string;
  detail: string;
  value: Arrow;
  /** The start end, whose glyphs face left and whose menu opens rightward. */
  start: boolean;
  onChange: (arrow: Arrow) => void;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
  };
  return (
    <div className={start ? "arrow-picker start" : "arrow-picker"} ref={ref}>
      <button
        type="button"
        className="arrow-picker-button"
        aria-label={`${label}: ${arrowLabel(value)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-hint-detail={detail}
        onClick={() => setOpen(!open)}
        onKeyDown={closeOnEscape}
      >
        <ArrowGlyph arrow={value} start={start} />
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <ArrowMenu
          label={label}
          value={value}
          start={start}
          onKeyDown={closeOnEscape}
          onChoose={(arrow) => {
            onChange(arrow);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ArrowMenu({
  label,
  value,
  start,
  onKeyDown,
  onChoose,
}: Readonly<{
  label: string;
  value: Arrow;
  start: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
  onChoose: (arrow: Arrow) => void;
}>) {
  return (
    <div
      className="arrow-picker-menu"
      role="listbox"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {ARROW_GROUPS.map((group) => (
        <div key={group.title} role="group" aria-label={group.title}>
          <span className="arrow-picker-group">{group.title}</span>
          <div className="arrow-picker-grid">
            {group.arrows.map((arrow) => (
              <button
                key={arrow.value}
                type="button"
                role="option"
                aria-selected={arrow.value === value}
                aria-label={arrow.label}
                data-hint={arrow.label}
                onClick={() => onChoose(arrow.value)}
              >
                <ArrowGlyph arrow={arrow.value} start={start} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
