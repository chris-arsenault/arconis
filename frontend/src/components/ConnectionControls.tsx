import { Fragment, type ReactNode } from "react";
import { ArrowLeftRight, Repeat2, Route } from "lucide-react";
import type { Item, LinePath } from "../document/types";
import type { Appearance } from "../document/appearance";
import { ArrowPicker } from "./ArrowPicker";

const PATHS = [
  { value: "cornered", label: "Cornered" },
  { value: "diagonal", label: "Diagonal" },
  { value: "curved", label: "Curved" },
];

export function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="inspector-section" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SelectRow({
  title,
  label,
  detail,
  value,
  options,
  onChange,
}: Readonly<{
  title: string;
  label: string;
  detail: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}>) {
  return (
    <Fragment>
      <span>{title}</span>
      <select
        aria-label={label}
        data-hint-detail={detail}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Fragment>
  );
}

/**
 * A line's type and its two ends, as draw.io lays them out: each end's head chosen on its own,
 * from no head through arrows, shapes and cardinalities, with a swap between them.
 */
export function ConnectionControls({
  item,
  look,
  onLook,
  onRoute,
  onSwap,
  onReverse,
}: Readonly<{
  item: Item;
  look: Appearance;
  onLook: (look: Partial<Appearance>) => void;
  onRoute: () => void;
  onSwap: () => void;
  /** Null where turning the line around would change what it means, as for a branch. */
  onReverse: (() => void) | null;
}>) {
  const defaultPath = item.type === "reference" ? "diagonal" : "cornered";
  return (
    <Section title="Connection">
      <div className="select-grid">
        <SelectRow
          title="Type"
          label="Line type"
          detail="Draw this line with square corners, straight diagonals or curves."
          value={look.path ?? defaultPath}
          options={PATHS}
          onChange={(path) => onLook({ path: path as LinePath })}
        />
        <span>Ends</span>
        <div className="connection-ends">
          <ArrowPicker
            label="Line start"
            detail="Choose what the line has where it leaves its first object, including no head."
            value={look.startArrow}
            start
            onChange={(startArrow) => onLook({ startArrow })}
          />
          <button
            type="button"
            className="icon-action"
            aria-label="Swap arrowheads"
            data-hint-detail="Trade the start and end heads; the line stays attached the same way."
            onClick={onSwap}
          >
            <ArrowLeftRight size={14} />
          </button>
          <ArrowPicker
            label="Line end"
            detail="Choose what the line has where it arrives at its second object, including no head."
            value={look.arrow}
            start={false}
            onChange={(arrow) => onLook({ arrow })}
          />
        </div>
      </div>
      <div className="connection-actions">
        {onReverse && (
          <button
            className="text-action"
            data-hint-detail="Turn the line around so it starts where it ended; its heads move to the other ends."
            onClick={onReverse}
          >
            <Repeat2 size={14} /> Reverse
          </button>
        )}
        <button
          className="text-action"
          data-hint-detail="Add bends so the line goes around the objects between its ends."
          onClick={onRoute}
        >
          <Route size={14} /> Route around items
        </button>
      </div>
    </Section>
  );
}
