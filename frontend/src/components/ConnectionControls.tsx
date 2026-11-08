import { Fragment, type ReactNode } from "react";
import { Route } from "lucide-react";
import type { Arrow, Item, LinePath } from "../document/types";
import type { Appearance } from "../document/appearance";

const PATHS = [
  { value: "cornered", label: "Cornered" },
  { value: "diagonal", label: "Diagonal" },
  { value: "curved", label: "Curved" },
];
const ARROWS = [
  { value: "arrow", label: "Arrow" },
  { value: "open", label: "Open arrow" },
  { value: "none", label: "None" },
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
  value,
  options,
  onChange,
}: Readonly<{
  title: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}>) {
  return (
    <Fragment>
      <span>{title}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Fragment>
  );
}

export function ConnectionControls({
  item,
  look,
  onLook,
  onRoute,
}: Readonly<{
  item: Item;
  look: Appearance;
  onLook: (look: Partial<Appearance>) => void;
  onRoute: () => void;
}>) {
  const defaultPath = item.type === "reference" ? "diagonal" : "cornered";
  return (
    <Section title="Connection">
      <div className="select-grid">
        <SelectRow
          title="Type"
          label="Line type"
          value={look.path ?? defaultPath}
          options={PATHS}
          onChange={(path) => onLook({ path: path as LinePath })}
        />
        <SelectRow
          title="Start"
          label="Connector start arrow"
          value={look.startArrow ?? "none"}
          options={ARROWS}
          onChange={(arrow) => onLook({ startArrow: arrow as Arrow })}
        />
        <SelectRow
          title="End"
          label="Connector arrow"
          value={look.arrow ?? "arrow"}
          options={ARROWS}
          onChange={(arrow) => onLook({ arrow: arrow as Arrow })}
        />
      </div>
      <button className="text-action" onClick={onRoute}>
        <Route size={14} /> Route around items
      </button>
    </Section>
  );
}
