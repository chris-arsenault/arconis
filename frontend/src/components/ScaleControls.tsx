import { useLayoutEffect, useRef, useState } from "react";
import { Ruler, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { isCalibration, LENGTH_UNITS, SCALE_PRESETS, scaleBar } from "../document/units";
import "./scale.css";

export function ScaleControls({ editor }: Readonly<{ editor: EditorController }>) {
  const [open, setOpen] = useState(false);
  const bar = scaleBar(editor.document.calibration(), editor.graph.view.scale, editor.grid.unit);
  const line = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (line.current) line.current.style.width = `${bar.pixels}px`;
  }, [bar.pixels]);
  return (
    <div className="scale-controls">
      <button
        className="scale-bar"
        aria-label="Scale and units"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-hint-detail="Calibrate distances, choose units and set grid spacing."
      >
        <span className="scale-label">
          <span>0</span>
          <span data-testid="scale-distance">{bar.label}</span>
        </span>
        <span ref={line} className="scale-line" />
      </button>
      <button
        className="scale-measure"
        aria-label="Measure distance"
        data-hint-detail="Measure between two points, or calibrate a known distance; measurements stay constant while zooming."
        aria-pressed={editor.tool === "measure"}
        onClick={() => editor.setTool(editor.tool === "measure" ? "select" : "measure")}
      >
        <Ruler size={16} />
      </button>
      {open && (
        <ScaleSettings
          key={JSON.stringify(editor.document.calibration())}
          editor={editor}
          close={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CustomScale({ editor, close }: Readonly<{ editor: EditorController; close: () => void }>) {
  const calibration = editor.document.calibration();
  const [distance, setDistance] = useState(
    String(calibration ? (calibration.distance * 100) / calibration.world : 1)
  );
  const [unit, setUnit] = useState(calibration?.unit ?? "m");
  const [error, setError] = useState("");
  const apply = (world = 100) => {
    const value = { world, distance: Number(distance), unit: unit.trim() };
    if (!isCalibration(value)) {
      setError("Enter a positive finite distance and a unit (up to 32 characters).");
      return;
    }
    editor.document.undo.stopCapturing();
    editor.document.setCalibration(value);
    editor.document.undo.stopCapturing();
    close();
  };
  return (
    <>
      <p>This reference line at 1× represents:</p>
      <span className="scale-reference" aria-label="Reference line at normal zoom" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
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
        </div>
        <datalist id="length-units">
          {Object.keys(LENGTH_UNITS).map((key) => (
            <option key={key} value={key} />
          ))}
        </datalist>
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          data-hint-detail="Set the shared reference distance without changing object geometry."
        >
          Apply custom scale
        </button>
      </form>
    </>
  );
}

function ScaleSettings({
  editor,
  close,
}: Readonly<{ editor: EditorController; close: () => void }>) {
  return (
    <section className="scale-settings" aria-label="Scale and units settings">
      <header>
        <strong>Scale and units</strong>
        <button
          aria-label="Close scale settings"
          data-hint-detail="Close these controls and return to the canvas."
          onClick={close}
        >
          <X size={16} />
        </button>
      </header>
      <PresetScale editor={editor} />
      <CustomScale editor={editor} close={close} />
      <DisplayUnits editor={editor} />
      <GridInterval editor={editor} />
      <button
        data-hint-detail="Measure two points, then enter their known separation to calibrate the drawing."
        onClick={() => {
          editor.setTool("measure");
          close();
        }}
      >
        Measure a known distance to calibrate
      </button>
      <button
        data-hint-detail="Remove physical calibration and read distances in canvas units; geometry stays as it is."
        onClick={() => {
          editor.document.undo.stopCapturing();
          editor.document.setCalibration(null);
          editor.document.undo.stopCapturing();
        }}
      >
        Use canvas units
      </button>
      <small>
        Calibration is shared. Display units and grid spacing are yours. Changing scale preserves
        geometry.
      </small>
    </section>
  );
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
          if (!preset) return;
          editor.document.undo.stopCapturing();
          editor.document.setCalibration({
            world: 100,
            distance: preset.distance,
            unit: preset.unit,
          });
          editor.document.undo.stopCapturing();
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
        onChange={(event) => editor.grid.setUnit(event.target.value)}
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
        setError("");
      }}
    >
      <label data-hint-detail="Set a positive snapping interval in the displayed unit, such as 2.54 mm.">
        Grid: {editor.grid.label}
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
