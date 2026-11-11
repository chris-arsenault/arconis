import type { InkSettings } from "../editor/inkCommands";
import { NumericInput } from "./NumericInput";
import { PLAIN_NUMBER, POSITIVE_NUMBER } from "./numericRules";
import { useId } from "react";
interface BrushProps {
  settings: InkSettings;
  change: (values: Partial<InkSettings>) => void;
}
const CLOSE_PATHS_HELP = "Join or separate the two ends of each selected path.";
const COLORS = ["#6554c0", "#e64980", "#ffcc00", "#2f9e44", "#1971c2", "#212529", "#ffffff"];

function capabilities(settings: InkSettings, selected: boolean, closed: boolean) {
  const paint = ["pen", "highlighter", "highlight"].includes(settings.mode) || selected;
  return {
    paint,
    width: paint || ["eraser", "precision"].includes(settings.mode),
    fill: (paint && closed) || settings.mode === "fill",
  };
}

export function BrushControls({
  settings,
  change,
  recent,
  selected,
  onClose,
  closed,
  onTarget,
}: Readonly<
  BrushProps & {
    recent: string[];
    selected: boolean;
    closed: boolean;
    onClose: () => void;
    onTarget: (target: "color" | "fill") => void;
  }
>) {
  const controls = capabilities(settings, selected, closed);
  const eraser = !controls.paint && controls.width;
  return (
    <>
      {controls.paint && (
        <fieldset className="paint-group" aria-label="Stroke">
          <legend>Stroke</legend>
          <ColorControls
            label="Stroke"
            value={settings.color}
            recent={recent}
            onFocus={() => onTarget("color")}
            change={(color) => change({ color })}
          />
          <BrushWidths settings={settings} change={change} />
        </fieldset>
      )}
      {eraser && <BrushWidths settings={settings} change={change} />}
      {controls.fill && (
        <fieldset className="paint-group" aria-label="Fill">
          <legend>Fill</legend>
          <ColorControls
            label="Fill"
            value={settings.fill}
            recent={recent}
            onFocus={() => onTarget("fill")}
            change={(fill) => change({ fill })}
          />
          <PaintControls settings={settings} change={change} />
        </fieldset>
      )}
      {controls.paint && (
        <label className="drawing-field">
          Opacity{" "}
          <span className="drawing-opacity">
            <input
              aria-label="Ink opacity"
              data-hint-detail="How see-through the ink is, from 0 to 100 percent."
              type="range"
              min="0"
              max="100"
              value={settings.opacity}
              onChange={(event) => change({ opacity: Number(event.target.value) })}
            />
            <output>{settings.opacity}%</output>
          </span>
        </label>
      )}
      {selected && settings.mode !== "highlight" && (
        <button data-hint-detail={CLOSE_PATHS_HELP} onClick={onClose}>
          {closed ? "Open selected paths" : "Close selected paths"}
        </button>
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
            data-hint-detail="Use this width, in pixels."
            onClick={() => change({ width })}
          >
            {width}
          </button>
        ))}
        <NumericInput
          label="Stroke width"
          detail="Type any width in pixels greater than 0."
          rules={POSITIVE_NUMBER}
          id=""
          value={settings.width}
          onCommit={(width) => change({ width })}
          unit=""
        />
      </div>
    </div>
  );
}

function ColorControls({
  label,
  value,
  change,
  recent,
  onFocus,
}: Readonly<{
  label: string;
  value: string;
  change: (color: string) => void;
  recent: string[];
  onFocus: () => void;
}>) {
  return (
    <div className="drawing-field stacked" onFocus={onFocus}>
      <span>Color</span>
      <div className="drawing-options" role="group" aria-label={`${label} colors`}>
        <button
          className="no-paint"
          aria-label={`No ${label.toLowerCase()}`}
          aria-pressed={value === "none"}
          data-hint-detail={`Leave the ${label.toLowerCase()} unpainted.`}
          onClick={() => change("none")}
        >
          ∅
        </button>
        {[...new Set([...COLORS, ...recent])].map((color) => (
          <button
            key={color}
            aria-label={`${label} ${color}`}
            aria-pressed={value === color}
            data-hint-detail={`Use this color for the ${label.toLowerCase()}.`}
            className="ink-swatch"
            onClick={() => change(color)}
          >
            <svg width="18" height="18" aria-hidden="true">
              <circle cx="9" cy="9" r="8" fill={color} />
            </svg>
          </button>
        ))}
        <input
          aria-label={`${label} color`}
          type="color"
          data-hint-detail={`Pick any ${label.toLowerCase()} color from the full color chooser.`}
          value={value === "none" ? "#ffffff" : value}
          onChange={(event) => change(event.target.value)}
        />
      </div>
    </div>
  );
}

function PaintControls({ settings, change }: Readonly<BrushProps>) {
  const angleId = useId();
  return (
    <details className="drawing-group">
      <summary data-hint-detail="Blend the fill from its color into a second color.">
        Fill gradient
      </summary>
      <div className="drawing-tools">
        <label className="drawing-field" data-hint-detail="The second color the fill blends into.">
          Gradient color
          <span className="drawing-options">
            <input
              aria-label="Gradient color"
              type="color"
              value={settings.gradient === "none" ? "#ffffff" : settings.gradient}
              onChange={(event) => change({ gradient: event.target.value })}
            />
            <button
              type="button"
              data-hint-detail="Remove the gradient so the fill is one color."
              onClick={() => change({ gradient: "none" })}
            >
              Solid fill
            </button>
          </span>
        </label>
        <label
          className="drawing-field"
          htmlFor={angleId}
          data-hint-detail="The direction the gradient runs, in degrees."
        >
          Gradient angle <small>°</small>
          <NumericInput
            id={angleId}
            detail="The direction the gradient runs, in degrees."
            rules={PLAIN_NUMBER}
            label="Gradient angle"
            value={settings.gradientAngle}
            onCommit={(gradientAngle) => change({ gradientAngle })}
            unit=""
          />
        </label>
        <p className="drawing-hint">
          The gradient starts at Fill. Select a filled path to drag its direction handle.
        </p>
      </div>
    </details>
  );
}
