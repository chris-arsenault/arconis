import { Fragment, type ReactNode } from "react";
import { Route } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { Arrow, Item, LinePath } from "../document/types";
import { resolvedLook } from "../editor/styles";
import { routeLineAround } from "../language/routes";

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

/** Places a line's points around the items between its ends, as one undoable change. */
function routeAround(editor: EditorController, item: Item) {
  const { document } = editor;
  const lookOf = (other: Item) => resolvedLook(other, document.namedStyle(other.style));
  const route = routeLineAround(document.list(), item, lookOf);
  if (!route) return;
  document.undo.stopCapturing();
  document.patch(item.id, route);
  document.undo.stopCapturing();
}

export function ConnectionControls({
  editor,
  item,
}: Readonly<{ editor: EditorController; item: Item }>) {
  const look = resolvedLook(item, editor.document.namedStyle(item.style));
  const defaultPath = item.type === "reference" ? "diagonal" : "cornered";
  return (
    <Section title="Connection">
      <div className="select-grid">
        <SelectRow
          title="Type"
          label="Line type"
          value={look.path ?? defaultPath}
          options={PATHS}
          onChange={(path) => editor.document.patchLook(item.id, { path: path as LinePath })}
        />
        <SelectRow
          title="Start"
          label="Connector start arrow"
          value={look.startArrow ?? "none"}
          options={ARROWS}
          onChange={(arrow) => editor.document.patchLook(item.id, { startArrow: arrow as Arrow })}
        />
        <SelectRow
          title="End"
          label="Connector arrow"
          value={look.arrow ?? "arrow"}
          options={ARROWS}
          onChange={(arrow) => editor.document.patchLook(item.id, { arrow: arrow as Arrow })}
        />
      </div>
      <button className="text-action" onClick={() => routeAround(editor, item)}>
        <Route size={14} /> Route around items
      </button>
    </Section>
  );
}
