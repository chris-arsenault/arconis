import { useState } from "react";
import type { EditorController } from "../editor/controller";
import { formatDistance, readLength } from "../document/units";
import { writeCanvas } from "../editor/canvasWrite";
import { scaleStatement } from "../language/printer";

/**
 * The Measure tool's line, with its length at the middle of the line. Clicking the length of a
 * finished measurement lets a person type what it really is, which calibrates the canvas.
 */
export function DistanceMeasure({ editor }: Readonly<{ editor: EditorController }>) {
  const measurement = editor.measurement.value;
  if (editor.tool !== "measure" || !measurement) return null;
  const { start, end } = measurement;
  const { scale, translate } = editor.graph.view;
  const screen = (point: { x: number; y: number }) => ({
    x: (point.x + translate.x) * scale,
    y: (point.y + translate.y) * scale,
  });
  const a = screen(start);
  const b = screen(end);
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const distance = Math.hypot(dx, dy);
  const units = editor.scales.between(start.holder, end.holder);
  const label = (value: number) => formatDistance(value * units.factor, units.unit, true);
  return (
    <div className="distance-overlay">
      <svg aria-hidden="true">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <circle cx={a.x} cy={a.y} r="4" />
        <circle cx={b.x} cy={b.y} r="4" />
      </svg>
      <div
        className="distance-label"
        ref={(element) => {
          if (!element) return;
          element.style.left = `${(a.x + b.x) / 2}px`;
          element.style.top = `${(a.y + b.y) / 2}px`;
        }}
      >
        <MeasuredLength
          key={`${start.x},${start.y},${end.x},${end.y}`}
          editor={editor}
          distance={distance}
          text={label(distance)}
          calibrates={measurement.complete && distance > 0 && !units.mixed}
          owner={units.owner}
          unit={editor.document.contentScale(start.holder).calibration?.unit ?? "m"}
        />
        {/* A slanted line also reads as how far it runs across and down. */}
        {dx > 0 && dy > 0 && (
          <span className="distance-parts">
            ΔX {label(dx)} · ΔY {label(dy)}
          </span>
        )}
      </div>
    </div>
  );
}

interface LengthProps {
  owner: string;
  unit: string;
  editor: EditorController;
  /** The line's length in canvas units, and as it reads in the display unit. */
  distance: number;
  text: string;
  /** Whether the measurement is finished, so its length can be typed over. */
  calibrates: boolean;
}

/** The length as a number people can read, and click to type the real one. */
function MeasuredLength({
  editor,
  distance,
  text,
  calibrates,
  owner,
  unit,
}: Readonly<LengthProps>) {
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (typing === null)
    return (
      <button
        className="distance-length"
        aria-label="Measured distance"
        data-hint="Type the real length"
        data-hint-detail="Type the known length to calibrate the drawing containing this measurement."
        disabled={!calibrates}
        onClick={() => setTyping(text)}
      >
        {text}
      </button>
    );
  const apply = () => {
    const length = readLength(typing, unit);
    if (!length) {
      setError("Type a length such as 3 m.");
      return;
    }
    const calibration = { world: distance, ...length };
    writeCanvas(
      editor.document,
      owner
        ? `edit ${owner} ${scaleStatement(calibration, "calibrate-panel")}`
        : scaleStatement(calibration)
    );
    setTyping(null);
  };
  return (
    <>
      <input
        ref={(input) => input?.focus()}
        className="distance-length"
        aria-label="Real length of the measured line"
        data-hint-detail="Type a length such as 3 m and press Enter to calibrate; Escape cancels."
        aria-invalid={error ? true : undefined}
        value={typing}
        onChange={(event) => {
          setTyping(event.target.value);
          setError("");
        }}
        onBlur={() => setTyping(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply();
          if (event.key === "Escape") setTyping(null);
          event.stopPropagation();
        }}
      />
      {error && (
        <span className="distance-parts" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
