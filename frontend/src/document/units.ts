/** Calibration interprets existing world geometry; changing it never transforms the objects. */
export interface Calibration {
  world: number;
  distance: number;
  unit: string;
}

export const LENGTH_UNITS: Readonly<Record<string, number>> = {
  nm: 1e-9,
  µm: 1e-6,
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
};

export const SCALE_PRESETS = [
  { name: "Paper", distance: 25, unit: "mm" },
  { name: "Electronics", distance: 10, unit: "mm" },
  { name: "Product", distance: 100, unit: "mm" },
  { name: "House", distance: 1, unit: "m" },
  { name: "Site", distance: 100, unit: "m" },
  { name: "Geography", distance: 1, unit: "km" },
] as const;

export function isCalibration(value: unknown): value is Calibration {
  if (!value || typeof value !== "object") return false;
  if (!("world" in value && "distance" in value && "unit" in value)) return false;
  return validDistances(value.world, value.distance) && validUnitLabel(value.unit);
}

function validDistances(world: unknown, distance: unknown) {
  if (typeof world !== "number" || typeof distance !== "number") return false;
  return [world, distance, distance / world].every(
    (number) => Number.isFinite(number) && number > 0
  );
}

function validUnitLabel(unit: unknown) {
  return typeof unit === "string" && unit.trim().length > 0 && unit.length <= 32;
}

function physicalUnit(unit: string) {
  return Object.hasOwn(LENGTH_UNITS, unit);
}

export function readCalibration(text: string | undefined): Calibration | null {
  try {
    const value: unknown = JSON.parse(text ?? "null");
    return isCalibration(value) ? value : null;
  } catch {
    return null;
  }
}

export function compatibleUnit(calibration: Calibration | null, preferred: string) {
  if (!calibration) return "u";
  return preferred === calibration.unit ||
    (physicalUnit(preferred) && physicalUnit(calibration.unit))
    ? preferred
    : calibration.unit;
}

/** Display units per world unit, including custom units whose label has no physical conversion. */
export function distanceFactor(calibration: Calibration | null, preferred = "") {
  if (!calibration) return 1;
  const unit = compatibleUnit(calibration, preferred);
  const conversion =
    unit === calibration.unit ? 1 : LENGTH_UNITS[calibration.unit] / LENGTH_UNITS[unit];
  return (calibration.distance / calibration.world) * conversion;
}

/** The first 1/2/5 interval at least as large as the requested distance. */
export function niceDistance(minimum: number) {
  const power = 10 ** Math.floor(Math.log10(minimum));
  const fraction = minimum / power;
  const step = [1, 2, 5, 10].find((value) => value >= fraction) ?? 10;
  return step * power;
}

export function scaleBar(calibration: Calibration | null, zoom: number, preferred: string) {
  const factor = distanceFactor(calibration, preferred);
  const distance = niceDistance((80 * factor) / zoom);
  return {
    distance,
    pixels: (distance / factor) * zoom,
    label: formatDistance(distance, compatibleUnit(calibration, preferred), true),
  };
}

export function formatDistance(value: number, unit: string, adaptive = false) {
  let display = unit,
    distance = value;
  if (adaptive && ["nm", "µm", "mm", "cm", "m", "km"].includes(unit) && value !== 0) {
    const metres = value * LENGTH_UNITS[unit];
    display =
      ["km", "m", "mm", "µm", "nm"].find((key) => Math.abs(metres) >= LENGTH_UNITS[key]) ?? "nm";
    distance = metres / LENGTH_UNITS[display];
  }
  return `${Number(distance.toPrecision(6))} ${display}`;
}

/**
 * A typed length such as "3", "3 m" or "2.5ft" as its number and unit; a bare number takes
 * `unit`. Null when it is not a positive length with a usable unit label.
 */
export function readLength(text: string, unit: string) {
  const source = text.trim();
  let end = 0;
  while (end < source.length && "0123456789.".includes(source[end])) end += 1;
  const distance = Number(source.slice(0, end));
  const label = source.slice(end).trim() || unit;
  if (end === 0 || !Number.isFinite(distance) || distance <= 0) return null;
  return validUnitLabel(label) ? { distance, unit: label } : null;
}

/** A suffix converts explicit units; arithmetic is evaluated by the caller in the display unit. */
export function unitExpression(source: string, displayUnit: string) {
  const token = /(\d*\.?\d+)(e[+-]?\d+)?\s*([a-zµ]+)?/iy;
  let output = "",
    index = 0;
  while (index < source.length) {
    token.lastIndex = index;
    const match = token.exec(source);
    if (!match) {
      output += source[index++];
      continue;
    }
    const number = match[1] + (match[2] ?? "");
    output += convertedLiteral(number, match[3] ?? "", displayUnit);
    index = token.lastIndex;
  }
  return output;
}

function convertedLiteral(number: string, unit: string, display: string) {
  if (!unit || unit === display) return number;
  if (!physicalUnit(unit) || !physicalUnit(display)) return "invalid";
  return String((Number(number) * LENGTH_UNITS[unit]) / LENGTH_UNITS[display]);
}
