import type { InkSettings } from "../editor/inkCommands";
import type { InkKind } from "../document/types";

export interface DrawingActions {
  change: (settings: Partial<InkSettings>) => void;
  favorite: (index: number, save: boolean) => void;
  toggle: () => void;
  clear: () => void;
  recolor: () => void;
  make: () => void;
  blank: () => void;
  leave: () => void;
  fit: () => void;
  demote: () => void;
  fill: () => void;
  close: () => void;
}
interface Props {
  settings: InkSettings;
  visible: boolean;
  activeSketch: string;
  favorites: InkSettings[];
  recent: string[];
  selection: { canPromote: boolean; hasDrawing: boolean };
  actions: DrawingActions;
}
interface BrushProps {
  settings: InkSettings;
  change: DrawingActions["change"];
}
const MODES: [InkSettings["mode"], string][] = [
  ["pen", "Pen"],
  ["highlighter", "Highlighter"],
  ["highlight", "Highlight object"],
  ["lasso", "Lasso"],
  ["eraser", "Eraser"],
  ["fill", "Fill"],
  ["eyedropper", "Eyedropper"],
  ["precision", "Precision eraser"],
];
const SHAPES: [InkKind, string][] = [
  ["freehand", "Freehand"],
  ["line", "Line"],
  ["arrow", "Arrow"],
  ["rectangle", "Box"],
  ["ellipse", "Circle"],
  ["double-arrow", "Double arrow"],
  ["polygon", "Polygon"],
  ["bracket", "Bracket"],
  ["brace", "Brace"],
  ["cloud", "Revision cloud"],
];
const COLORS = ["#6554c0", "#e64980", "#ffcc00", "#2f9e44", "#1971c2", "#212529", "#ffffff"];

/** Leaf controls receive semantic preferences and a focused drawing command port. */
export function DrawingTools(props: Readonly<Props>) {
  const { settings, actions } = props;
  const change = actions.change;
  return (
    <section className="drawing-tools" aria-label="Drawing tools">
      <DrawingObjectActions
        active={!!props.activeSketch}
        selection={props.selection}
        actions={actions}
      />
      <div className="drawing-options" role="toolbar" aria-label="Drawing instruments">
        {MODES.map(([mode, label]) => (
          <button key={mode} aria-pressed={settings.mode === mode} onClick={() => change({ mode })}>
            {label}
          </button>
        ))}
      </div>
      <label>
        Geometry
        <select
          aria-label="Drawing geometry"
          value={settings.shape}
          onChange={(event) => change({ shape: event.target.value as InkKind })}
        >
          {SHAPES.map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <BrushWidths settings={settings} change={change} />
      <BrushColors settings={settings} change={change} recent={props.recent} />
      <PaintControls
        settings={settings}
        change={change}
        onFill={actions.fill}
        onClose={actions.close}
      />
      <div className="drawing-options" role="group" aria-label="Favorite brushes">
        {props.favorites.map((favorite, index) => (
          <button
            key={index}
            aria-label={`Favorite ${index + 1}`}
            title={`${favorite.mode}, ${favorite.width}. Shift-click to save.`}
            onClick={(event) => actions.favorite(index, event.shiftKey)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <p className="drawing-hint">
        Shift constrains shapes. Enter finishes polygons. Shift-click a favorite to save.
      </p>
      <div className="drawing-options">
        <button aria-pressed={props.visible} onClick={actions.toggle}>
          Show markup
        </button>
        <button onClick={actions.recolor}>Recolor selection</button>
        <button onClick={actions.clear}>Clear markup</button>
      </div>
    </section>
  );
}

function DrawingObjectActions({
  active,
  selection,
  actions,
}: Readonly<{
  active: boolean;
  selection: Props["selection"];
  actions: Pick<DrawingActions, "make" | "blank" | "fit" | "demote" | "leave">;
}>) {
  return (
    <>
      <strong>{active ? "Editing Drawing" : "Markup"}</strong>
      <div className="drawing-options">
        {selection.canPromote && <button onClick={actions.make}>Make Drawing</button>}
        <button onClick={actions.blank}>New Drawing</button>
        {selection.hasDrawing && (
          <>
            <button onClick={actions.fit}>Fit bounds to drawing</button>
            <button onClick={actions.demote}>Return to markup</button>
          </>
        )}
        {active && <button onClick={actions.leave}>Finish Drawing</button>}
      </div>
    </>
  );
}

function BrushWidths({ settings, change }: Readonly<BrushProps>) {
  const widths = settings.mode === "highlighter" ? [8, 16, 24, 36, 48] : [1, 3, 6, 10, 16];
  return (
    <>
      <div className="drawing-options" role="group" aria-label="Brush sizes">
        {widths.map((width) => (
          <button
            key={width}
            aria-label={`Brush size ${width}`}
            aria-pressed={settings.width === width}
            onClick={() => change({ width })}
          >
            {width}
          </button>
        ))}
      </div>
      <label>
        Width
        <input
          aria-label="Brush width"
          type="number"
          min="0.1"
          step="0.5"
          value={settings.width}
          onChange={(event) => {
            const width = Number(event.target.value);
            if (width > 0) change({ width });
          }}
        />
      </label>
    </>
  );
}

function BrushColors({ settings, change, recent }: Readonly<BrushProps & { recent: string[] }>) {
  return (
    <div className="drawing-options" role="group" aria-label="Ink colors">
      {[...new Set([...COLORS, ...recent])].map((color) => (
        <button
          key={color}
          aria-label={`Ink ${color}`}
          className="ink-swatch"
          onClick={() => change({ color })}
        >
          <svg width="18" height="18" aria-hidden="true">
            <circle cx="9" cy="9" r="8" fill={color} />
          </svg>
        </button>
      ))}
      <input
        aria-label="Ink color"
        type="color"
        value={settings.color}
        onChange={(event) => change({ color: event.target.value })}
      />
    </div>
  );
}

function PaintControls({
  settings,
  change,
  onFill,
  onClose,
}: Readonly<BrushProps & { onFill: () => void; onClose: () => void }>) {
  return (
    <details>
      <summary>Fill and gradient</summary>
      <label>
        Shape fill
        <input
          aria-label="Shape fill"
          type="color"
          value={settings.fill === "none" ? "#ffffff" : settings.fill}
          onChange={(event) => change({ fill: event.target.value })}
        />
      </label>
      <button onClick={() => change({ fill: "none" })}>No shape fill</button>
      <label>
        Gradient color
        <input
          aria-label="Gradient color"
          type="color"
          value={settings.gradient === "none" ? "#ffffff" : settings.gradient}
          onChange={(event) => change({ gradient: event.target.value })}
        />
      </label>
      <button onClick={() => change({ gradient: "none" })}>Solid fill</button>
      <label>
        Gradient angle
        <input
          aria-label="Gradient angle"
          type="number"
          value={settings.gradientAngle}
          onChange={(event) => change({ gradientAngle: Number(event.target.value) })}
        />
      </label>
      <button onClick={onClose}>Close or open selected path</button>
      <button onClick={onFill}>Fill selection</button>
      <p className="drawing-hint">
        Fill uses the ink color. Select a gradient-filled path to drag its direction handle.
      </p>
    </details>
  );
}
