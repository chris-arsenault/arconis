import { Fragment, type ReactNode } from "react";
import type { EditorController } from "../editor/controller";
import type { CanvasObject, StyleValue } from "../document/types";
import { objectStyle } from "../editor/styles";

const ROUTES = [
  { value: "orthogonalEdgeStyle", label: "Orthogonal" },
  { value: "elbowEdgeStyle", label: "Elbow" },
  { value: "none", label: "Straight" },
];
const ARROWS = [
  { value: "block", label: "Arrow" },
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
}: Readonly<{ editor: EditorController; item: CanvasObject }>) {
  const style = objectStyle(item) as Record<string, StyleValue | undefined>;
  const patchStyle = (key: string) => (value: string) =>
    editor.document.patchStyle(item.id, { [key]: value });
  return (
    <Section title="Connection">
      <div className="select-grid">
        <SelectRow
          title="Route"
          label="Connector routing"
          value={String(style.edgeStyle || "orthogonalEdgeStyle")}
          options={ROUTES}
          onChange={patchStyle("edgeStyle")}
        />
        <SelectRow
          title="End"
          label="Connector arrow"
          value={String(style.endArrow || "block")}
          options={ARROWS}
          onChange={patchStyle("endArrow")}
        />
      </div>
    </Section>
  );
}
