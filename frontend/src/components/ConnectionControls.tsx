import { Fragment, type ReactNode } from "react";
import type { EditorController } from "../editor/controller";
import type { Arrow, Item, Route } from "../document/types";
import { resolvedLook } from "../editor/styles";

const ROUTES = [
  { value: "orthogonal", label: "Orthogonal" },
  { value: "elbow", label: "Elbow" },
  { value: "straight", label: "Straight" },
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
  editor,
  item,
}: Readonly<{ editor: EditorController; item: Item }>) {
  const look = resolvedLook(item, editor.document.namedStyle(item.style));
  return (
    <Section title="Connection">
      <div className="select-grid">
        <SelectRow
          title="Route"
          label="Connector routing"
          value={look.route ?? "orthogonal"}
          options={ROUTES}
          onChange={(route) => editor.document.patchLook(item.id, { route: route as Route })}
        />
        <SelectRow
          title="End"
          label="Connector arrow"
          value={look.arrow ?? "arrow"}
          options={ARROWS}
          onChange={(arrow) => editor.document.patchLook(item.id, { arrow: arrow as Arrow })}
        />
      </div>
    </Section>
  );
}
