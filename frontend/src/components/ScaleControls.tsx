import { useLayoutEffect, useRef, useState } from "react";
import type { EditorController } from "../editor/controller";
import {
  isCalibration,
  LENGTH_UNITS,
  SCALE_PRESETS,
  scaleBar,
  type Calibration,
} from "../document/units";
import "./scale.css";

/** How long a round distance is at the current zoom: a readout among the view controls. */
export function ScaleBar({ editor }: Readonly<{ editor: EditorController }>) {
  const bar = scaleBar(editor.document.calibration(), editor.graph.view.scale, editor.grid.unit);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (line.current) line.current.style.width = `${bar.pixels}px`;
  }, [bar.pixels]);
  return (
    <span
      className="scale-bar"
      role="img"
      aria-label={`Scale: this line is ${bar.label}`}
      data-help-id="scale-controls"
      data-help-topic="editing#scale-units-and-measurement"
    >
      <span data-testid="scale-distance">{bar.label}</span>
      <span ref={line} className="scale-line" />
    </span>
  );
}

/** Sets the shared calibration, or clears it with null, as one undo step. */
function calibrate(editor: EditorController, value: Calibration | null) {
  editor.document.undo.stopCapturing();
  editor.document.setCalibration(value);
  editor.document.undo.stopCapturing();
}

function PresetScale({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <label data-hint-detail="Set the distance represented by the reference line at normal zoom.">
      Working scale
      <select
        aria-label="Scale preset"
        value=""
        onChange={(event) => {
          const preset = SCALE_PRESETS.find((entry) => entry.name === event.target.value);
          if (preset)
            calibrate(editor, { world: 100, distance: preset.distance, unit: preset.unit });
        }}
      >
        <option value="" disabled>
          Choose a preset
        </option>
        {SCALE_PRESETS.map((preset) => (
          <option key={preset.name} value={preset.name}>
            {preset.name} — {preset.distance} {preset.unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function CustomScale({ editor }: Readonly<{ editor: EditorController }>) {
  const calibration = editor.document.calibration();
  const [distance, setDistance] = useState(
    String(calibration ? (calibration.distance * 100) / calibration.world : 1)
  );
  const [unit, setUnit] = useState(calibration?.unit ?? "m");
  const [error, setError] = useState("");
  const apply = () => {
    const value = { world: 100, distance: Number(distance), unit: unit.trim() };
    if (!isCalibration(value)) {
      setError("Enter a positive finite distance and a unit (up to 32 characters).");
      return;
    }
    setError("");
    calibrate(editor, value);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <span>This reference line at 1× represents</span>
      <span className="scale-reference" aria-label="Reference line at normal zoom" />
      <div className="scale-values">
        <input
          aria-label="Reference distance"
          data-hint-detail="The positive distance represented by the reference line at normal zoom."
          inputMode="decimal"
          value={distance}
          onChange={(event) => setDistance(event.target.value)}
        />
        <input
          aria-label="Calibration unit"
          data-hint-detail="Choose a physical unit or type your own unit label."
          list="length-units"
          value={unit}
          maxLength={32}
          onChange={(event) => setUnit(event.target.value)}
        />
        <button
          type="submit"
          data-hint-detail="Set the shared reference distance without changing object geometry."
        >
          Apply custom scale
        </button>
      </div>
      <datalist id="length-units">
        {Object.keys(LENGTH_UNITS).map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function DisplayUnits({ editor }: Readonly<{ editor: EditorController }>) {
  const calibration = editor.document.calibration();
  if (!calibration) return null;
  const units = Object.hasOwn(LENGTH_UNITS, calibration.unit)
    ? Object.keys(LENGTH_UNITS)
    : [calibration.unit];
  return (
    <label data-hint-detail="Convert distance readouts on this device without changing the shared calibration.">
      Display unit
      <select
        aria-label="Display unit"
        value={editor.grid.unit}
        onChange={(event) => {
          editor.grid.setUnit(event.target.value);
          editor.emit();
        }}
      >
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function GridInterval({ editor }: Readonly<{ editor: EditorController }>) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const distance = Number(value);
        if (!Number.isFinite(distance) || distance <= 0) {
          setError("Enter a positive grid distance.");
          return;
        }
        editor.grid.setFixed(distance);
        editor.emit();
        setError("");
      }}
    >
      <label data-hint-detail="Set a positive snapping interval in the displayed unit, such as 2.54 mm.">
        <span data-testid="grid-spacing">Grid spacing: {editor.grid.label}</span>
        <input
          aria-label="Fixed grid distance"
          placeholder={`Distance in ${editor.grid.unit}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div className="scale-values">
        <button
          type="submit"
          data-hint-detail="Keep snapping at this distance while zooming; distant grid lines may be skipped."
        >
          Set fixed grid
        </button>
        <button
          type="button"
          data-hint-detail="Choose readable grid intervals automatically as the view changes."
          onClick={() => {
            editor.grid.setFixed(null);
            editor.emit();
            setValue("");
          }}
        >
          Automatic grid
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** The Settings section for the canvas's scale, the units it reads in and the grid's spacing. */
export function ScaleSettings({ editor }: Readonly<{ editor: EditorController }>) {
  const calibration = editor.document.calibration();
  return (
    <section className="scale-settings" aria-label="Scale and units">
      <h3>Scale and units</h3>
      <p>
        The scale is shared with everyone in the room and changes no object. The display unit and
        grid spacing are yours. To take the scale from the drawing, measure a known distance with
        Measure and click its length.
      </p>
      <PresetScale editor={editor} />
      <CustomScale key={JSON.stringify(calibration)} editor={editor} />
      <DisplayUnits editor={editor} />
      <GridInterval editor={editor} />
      {calibration && (
        <button
          data-hint-detail="Remove physical calibration and read distances in canvas units; geometry stays as it is."
          onClick={() => calibrate(editor, null)}
        >
          Use canvas units
        </button>
      )}
    </section>
  );
}
