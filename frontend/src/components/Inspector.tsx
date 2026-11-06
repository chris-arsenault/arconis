import { Copy, Group, Ungroup, Trash2, Link2, Bold, Italic } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { COLORS, KIND_LABELS, type CanvasObject, type StyleValue } from "../document/types";

type ItemProps = Readonly<{ editor: EditorController; item: CanvasObject }>;
type StyleProps = Readonly<{
  item: CanvasObject;
  change: (key: string, value: StyleValue) => void;
}>;

export function Inspector({ editor }: Readonly<{ editor: EditorController }>) {
  const selected = editor.selected();
  const item = selected[0];
  if (!item) return <EmptyInspector />;
  return (
    <aside className="inspector" aria-label="Object properties">
      <div className="panel-heading">
        <span className="eyebrow">
          {selected.length > 1 ? `${selected.length} OBJECTS` : KIND_LABELS[item.kind]}
        </span>
        <button
          className="icon-button danger"
          title="Delete selection"
          aria-label="Delete selection"
          onClick={() => editor.remove()}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <label>
        Text
        <textarea
          aria-label="Object text"
          value={item.label}
          onChange={(event) => editor.document.editText(item.id, event.target.value)}
          rows={4}
        />
      </label>
      <StyleControls editor={editor} item={item} />
      <PositionControls editor={editor} item={item} />
      <div className="selection-actions">
        <button onClick={() => editor.duplicate()}>
          <Copy size={15} /> Duplicate
        </button>
        <button onClick={() => editor.group()} disabled={selected.length < 2}>
          <Group size={15} /> Group
        </button>
        <button
          onClick={() => editor.ungroup()}
          disabled={!selected.some((value) => value.kind === "group")}
        >
          <Ungroup size={15} /> Ungroup
        </button>
        <button onClick={() => editor.connect()} disabled={selected.length !== 2}>
          <Link2 size={15} /> Connect
        </button>
      </div>
      <p className="muted">Shift-click to select multiple objects. Drag handles to resize.</p>
    </aside>
  );
}

function EmptyInspector() {
  return (
    <aside className="inspector empty-inspector">
      <span className="eyebrow">MAKE IT YOURS</span>
      <h3>A place for every idea.</h3>
      <p>Select an object to edit its text, color, size, and connections.</p>
      <div className="shortcut-guide">
        <kbd>V</kbd> Select <kbd>N</kbd> Sticky note <kbd>P</kbd> Draw <kbd>Space</kbd> Pan{" "}
        <kbd>⌘ / Ctrl Z</kbd> Undo
      </div>
      <p className="muted">Double-click any object to write directly on the canvas.</p>
    </aside>
  );
}

function GeometryControls({ editor, item }: ItemProps) {
  const properties = ["x", "y", "width", "height"] as const;
  return (
    <>
      <span className="field-heading">POSITION & SIZE</span>
      <div className="geometry-fields">
        {properties.map((key) => (
          <label key={key}>
            {key}
            <input
              type="number"
              aria-label={`Object ${key}`}
              value={Math.round(item[key] * 100) / 100}
              min={key === "width" || key === "height" ? 1 : undefined}
              onChange={(event) =>
                editor.document.patch(item.id, { [key]: Number(event.target.value) })
              }
            />
          </label>
        ))}
      </div>
    </>
  );
}

function PositionControls(props: ItemProps) {
  if (props.item.kind === "connector") return <ConnectionControls {...props} />;
  if (props.item.kind === "stroke") return null;
  return <GeometryControls {...props} />;
}

function StyleControls({ editor, item }: ItemProps) {
  const change = (key: string, value: StyleValue) =>
    editor
      .selected()
      .forEach((selected) => editor.document.patchStyle(selected.id, { [key]: value }));
  return (
    <>
      <ColorControls item={item} change={change} />
      <TextControls item={item} change={change} />
      <label>
        Line width
        <input
          aria-label="Line width"
          type="number"
          min={1}
          max={20}
          value={Number(item.style.strokeWidth || 2)}
          onChange={(event) => change("strokeWidth", Number(event.target.value))}
        />
      </label>
    </>
  );
}

function ColorControls({ item, change }: StyleProps) {
  const fields = [
    { key: "fillColor", label: "Fill", value: "#ffffff" },
    { key: "strokeColor", label: "Line", value: "#7f8aa3" },
    { key: "fontColor", label: "Text color", value: "#283249" },
  ];
  return (
    <>
      <span className="field-heading">COLOR</span>
      <div className="swatches">
        {COLORS.map((color, index) => (
          <button
            key={color}
            title={`Fill ${color}`}
            aria-label={`Fill ${color}`}
            className={`swatch swatch-${index}`}
            aria-pressed={item.style.fillColor === color}
            onClick={() => change("fillColor", color)}
          />
        ))}
      </div>
      <div className="geometry-fields">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              aria-label={`${field.label} color`}
              type="color"
              value={String(item.style[field.key] || field.value)}
              onChange={(event) => change(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>
    </>
  );
}

function TextControls({ item, change }: StyleProps) {
  const fontStyle = Number(item.style.fontStyle || 0);
  return (
    <>
      <label>
        Font size
        <input
          aria-label="Font size"
          type="number"
          min={6}
          value={Number(item.style.fontSize || 16)}
          onChange={(event) => change("fontSize", Number(event.target.value))}
        />
      </label>
      <div className="format-controls">
        <button
          aria-label="Bold"
          aria-pressed={Boolean(fontStyle & 1)}
          onClick={() => change("fontStyle", fontStyle ^ 1)}
        >
          <Bold size={16} />
        </button>
        <button
          aria-label="Italic"
          aria-pressed={Boolean(fontStyle & 2)}
          onClick={() => change("fontStyle", fontStyle ^ 2)}
        >
          <Italic size={16} />
        </button>
        <select
          aria-label="Text alignment"
          value={String(item.style.align || "center")}
          onChange={(event) => change("align", event.target.value)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    </>
  );
}

function ConnectionControls({ editor, item }: ItemProps) {
  const objects = editor.document
    .list()
    .filter((value) => !["connector", "stroke"].includes(value.kind));
  return (
    <>
      <span className="field-heading">CONNECTION</span>
      {(["source", "target"] as const).map((key) => (
        <label key={key}>
          {key}
          <select
            aria-label={`Connector ${key}`}
            value={item[key]}
            onChange={(event) => editor.document.patch(item.id, { [key]: event.target.value })}
          >
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.label || KIND_LABELS[object.kind]}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Routing
        <select
          aria-label="Connector routing"
          value={String(item.style.edgeStyle || "orthogonalEdgeStyle")}
          onChange={(event) =>
            editor.document.patchStyle(item.id, { edgeStyle: event.target.value })
          }
        >
          <option value="orthogonalEdgeStyle">Orthogonal</option>
          <option value="elbowEdgeStyle">Elbow</option>
          <option value="none">Straight</option>
        </select>
      </label>
      <label>
        Arrow
        <select
          aria-label="Connector arrow"
          value={String(item.style.endArrow || "block")}
          onChange={(event) =>
            editor.document.patchStyle(item.id, { endArrow: event.target.value })
          }
        >
          <option value="block">Arrow</option>
          <option value="open">Open arrow</option>
          <option value="none">None</option>
        </select>
      </label>
    </>
  );
}
