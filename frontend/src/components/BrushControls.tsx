import { Blend } from "lucide-react";
import { useId } from "react";
import type { InkSettings } from "../editor/inkCommands";
import type { InkKind } from "../document/types";
import { NumericInput } from "./NumericInput";
interface BrushProps {
  settings: InkSettings;
  change: (values: Partial<InkSettings>) => void;
}
export const SHAPES: [InkKind, string][] = [
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

export function BrushControls({
  settings,
  change,
  recent,
  selected,
  onFill,
  onClose,
}: Readonly<
  BrushProps & { recent: string[]; selected: boolean; onFill: () => void; onClose: () => void }
>) {
  const drawsShapes = ["pen", "highlighter"].includes(settings.mode);
  const hasWidth = ["pen", "highlighter", "eraser", "precision"].includes(settings.mode);
  return (
    <>
      {drawsShapes && (
        <label className="drawing-field">
          Stroke shape
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
      )}
      {settings.shape === "polygon" && drawsShapes && (
        <p className="drawing-hint">Click corners. Enter closes the polygon; Escape cancels it.</p>
      )}
      {hasWidth && <BrushWidths settings={settings} change={change} />}
      {!["eraser", "precision", "eyedropper"].includes(settings.mode) && (
        <div className="drawing-field stacked">
          <span>Ink color</span>
          <BrushColors settings={settings} change={change} recent={recent} />
        </div>
      )}
      {(drawsShapes || settings.mode === "fill" || selected) && (
        <PaintControls
          settings={settings}
          change={change}
          onFill={onFill}
          onClose={onClose}
          selected={selected}
        />
      )}
    </>
  );
}
function BrushWidths({ settings, change }: Readonly<BrushProps>) {
  const widths = settings.mode === "highlighter" ? [8, 16, 24, 36, 48] : [1, 3, 6, 10, 16];
  return (
    <div className="drawing-field stacked">
      <span>Width</span>
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
        <NumericInput
          label="Brush width"
          positive
          value={settings.width}
          onCommit={(width) => change({ width })}
        />
      </div>
    </div>
  );
}

function BrushColors({ settings, change, recent }: Readonly<BrushProps & { recent: string[] }>) {
  return (
    <div className="drawing-options" role="group" aria-label="Ink colors">
      {[...new Set([...COLORS, ...recent])].map((color) => (
        <button
          key={color}
          aria-label={`Ink ${color}`}
          aria-pressed={settings.color === color}
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
  selected,
}: Readonly<BrushProps & { onFill: () => void; onClose: () => void; selected: boolean }>) {
  const angleId = useId();
  return (
    <details className="drawing-group">
      <summary>
        <Blend size={14} />
        Fill and gradient
      </summary>
      <div className="drawing-tools">
        <label className="drawing-field">
          Shape fill
          <span className="drawing-options">
            <input
              aria-label="Shape fill"
              type="color"
              value={settings.fill === "none" ? "#ffffff" : settings.fill}
              onChange={(event) => change({ fill: event.target.value })}
            />
            <button type="button" onClick={() => change({ fill: "none" })}>
              No shape fill
            </button>
          </span>
        </label>
        <label className="drawing-field">
          Gradient color
          <span className="drawing-options">
            <input
              aria-label="Gradient color"
              type="color"
              value={settings.gradient === "none" ? "#ffffff" : settings.gradient}
              onChange={(event) => change({ gradient: event.target.value })}
            />
            <button type="button" onClick={() => change({ gradient: "none" })}>
              Solid fill
            </button>
          </span>
        </label>
        <label className="drawing-field" htmlFor={angleId}>
          Gradient angle <small>°</small>
          <NumericInput
            id={angleId}
            label="Gradient angle"
            value={settings.gradientAngle}
            onCommit={(gradientAngle) => change({ gradientAngle })}
          />
        </label>
        {selected && (
          <div className="drawing-options">
            <button type="button" onClick={onClose}>
              Close or open selected path
            </button>
            <button type="button" onClick={onFill}>
              Fill selection
            </button>
          </div>
        )}
        <p className="drawing-hint">
          Fill uses the ink color. Select a gradient-filled path to drag its direction handle.
        </p>
      </div>
    </details>
  );
}
