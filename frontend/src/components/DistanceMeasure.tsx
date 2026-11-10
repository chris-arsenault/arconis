import { useState } from "react";
import type { EditorController } from "../editor/controller";
import { formatDistance, isCalibration, LENGTH_UNITS } from "../document/units";

export function DistanceMeasure({ editor }: Readonly<{ editor: EditorController }>) {
  const measurement = editor.measurement.value;
  if (editor.tool !== "measure") return null;
  if (!measurement)
    return (
      <div className="distance-result" role="status">
        Click or drag between points. Enter places points; arrows move the endpoint. Alt bypasses
        snapping. Escape exits.
      </div>
    );
  const { start, end } = measurement;
  const { scale, translate } = editor.graph.view;
  const screen = (point: { x: number; y: number }) => ({
    x: (point.x + translate.x) * scale,
    y: (point.y + translate.y) * scale,
  });
  const a = screen(start),
    b = screen(end);
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const label = (value: number) =>
    formatDistance(value * editor.grid.factor, editor.grid.unit, true);
  return (
    <div className="distance-overlay">
      <svg aria-hidden="true">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <circle cx={a.x} cy={a.y} r="4" />
        <circle cx={b.x} cy={b.y} r="4" />
      </svg>
      <div className="distance-result">
        <output aria-label="Measured distance">{label(distance)}</output>
        <span>
          ΔX {label(Math.abs(dx))} · ΔY {label(Math.abs(dy))}
        </span>
        {measurement.complete && distance > 0 && (
          <CalibrateDistance editor={editor} distance={distance} />
        )}
        <button
          data-hint-detail="Remove these temporary endpoints and measure another distance."
          onClick={() => editor.measurement.clear()}
        >
          Clear measurement
        </button>
        <button
          data-hint-detail="Return to selecting and editing objects."
          onClick={() => editor.setTool("select")}
        >
          Done measuring
        </button>
      </div>
    </div>
  );
}

function CalibrateDistance({
  editor,
  distance,
}: Readonly<{ editor: EditorController; distance: number }>) {
  const [known, setKnown] = useState("");
  const [unit, setUnit] = useState(editor.document.calibration()?.unit ?? "m");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const calibration = { world: distance, distance: Number(known), unit: unit.trim() };
        if (!isCalibration(calibration)) {
          setError("Enter a positive distance and unit.");
          return;
        }
        editor.document.undo.stopCapturing();
        editor.document.setCalibration(calibration);
        editor.document.undo.stopCapturing();
        setError("");
      }}
    >
      <input
        aria-label="Known distance"
        data-hint-detail="Enter the real distance between the two measured points."
        placeholder="Distance"
        value={known}
        onChange={(event) => setKnown(event.target.value)}
      />
      <input
        aria-label="Known distance unit"
        data-hint-detail="The unit of the known distance, such as mm, m or ft."
        list="measure-units"
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
      />
      <datalist id="measure-units">
        {Object.keys(LENGTH_UNITS).map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
      <button data-hint-detail="Set the shared canvas calibration from these endpoints and their known distance.">
        Calibrate this distance
      </button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}
