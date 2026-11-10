import type { InkSettings } from "../editor/inkCommands";
import { isClosedInk, shapePoints } from "../document/ink";
import type { InkKind } from "../document/types";
import { useId } from "react";

/** A sample uses the same authored paint and geometry as the next mark. */
export function StrokePreview({ settings }: Readonly<{ settings: InkSettings }>) {
  const markerId = useId();
  const shape = settings.mode === "highlight" ? "rectangle" : settings.shape;
  const freehand = shape === "freehand";
  const points = freehand
    ? ""
    : samplePoints(shape)
        .map((point) => point.join(","))
        .join(" ");
  return (
    <svg className="stroke-sample" viewBox="0 0 200 50" role="img" aria-label="Stroke preview">
      <SampleDefinitions id={markerId} settings={settings} />
      {freehand ? (
        <path
          d="M16 34 C48 4 72 42 105 23 S157 9 184 30"
          fill="none"
          stroke={settings.color}
          strokeWidth={Math.min(settings.width, 28)}
          opacity={settings.opacity / 100}
          strokeLinecap="round"
        />
      ) : (
        <polyline
          markerEnd={shape.includes("arrow") ? `url(#${markerId})` : undefined}
          markerStart={shape === "double-arrow" ? `url(#${markerId})` : undefined}
          points={points}
          fill={sampleFill(settings, shape, markerId)}
          stroke={settings.color}
          strokeWidth={Math.min(settings.width, 16)}
          opacity={settings.opacity / 100}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function samplePoints(shape: InkKind) {
  if (shape === "polygon")
    return [
      [20, 36],
      [60, 10],
      [150, 10],
      [180, 36],
      [20, 36],
    ];
  return shapePoints(shape, [20, 12], [180, 38]);
}

function sampleFill(settings: InkSettings, shape: InkKind, id: string) {
  if (!isClosedInk(shape) || settings.mode === "highlight") return "none";
  return settings.gradient === "none" ? settings.fill : `url(#${id}-fill)`;
}

function SampleDefinitions({ id, settings }: Readonly<{ id: string; settings: InkSettings }>) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="4"
        markerHeight="4"
        orient="auto-start-reverse"
      >
        <path d="M0 0 10 5 0 10Z" fill={settings.color} />
      </marker>
      {settings.gradient !== "none" && (
        <linearGradient
          id={`${id}-fill`}
          x1="0"
          y1="0.5"
          x2="1"
          y2="0.5"
          gradientTransform={`rotate(${settings.gradientAngle} .5 .5)`}
        >
          <stop offset="0%" stopColor={settings.fill} />
          <stop offset="100%" stopColor={settings.gradient} />
        </linearGradient>
      )}
    </defs>
  );
}
