import { LENGTH_UNITS, distanceFactor, type Calibration } from "./units";

/** Dry dressed US softwood dimensions, inches (DOC PS 20-25, Tables 2 and 3). */
export const LUMBER: Readonly<Record<string, readonly [number, number]>> = {
  "1x2": [0.75, 1.5],
  "1x3": [0.75, 2.5],
  "1x4": [0.75, 3.5],
  "1x6": [0.75, 5.5],
  "1x8": [0.75, 7.25],
  "1x10": [0.75, 9.25],
  "1x12": [0.75, 11.25],
  "2x2": [1.5, 1.5],
  "2x3": [1.5, 2.5],
  "2x4": [1.5, 3.5],
  "2x6": [1.5, 5.5],
  "2x8": [1.5, 7.25],
  "2x10": [1.5, 9.25],
  "2x12": [1.5, 11.25],
  "4x4": [3.5, 3.5],
};
/** Basic major diameter of numbered inch wood screws, inches (US NBS Circular 140). */
export const SCREWS: Readonly<Record<string, number>> = {
  "#2": 0.086,
  "#3": 0.099,
  "#4": 0.112,
  "#5": 0.125,
  "#6": 0.138,
  "#7": 0.151,
  "#8": 0.164,
  "#9": 0.177,
  "#10": 0.19,
  "#12": 0.216,
  "#14": 0.242,
};

export const SHEET_THICKNESSES = [
  "1/8 in",
  "1/4 in",
  "3/8 in",
  "1/2 in",
  "5/8 in",
  "3/4 in",
  "1 in",
];
const fit = [
  "span",
  "span-axis",
  "left",
  "left-axis",
  "left-inset",
  "right",
  "right-axis",
  "right-inset",
];
const stock = [
  "length",
  "material",
  "grade",
  "grain",
  "measured-width",
  "measured-thickness",
  "occupies",
  "inset",
  ...fit,
];
const location = ["face", "end", "offset", "edge", "edge-offset"];
const participants = ["through", "into", "receiving-face", ...location];
export const WOOD_FIELDS = {
  board: ["stock", ...stock],
  panel: ["thickness", "width", ...stock],
  joint: ["type", "bearing", ...participants],
  screw: [
    "joint",
    "gauge",
    "type",
    "length",
    "clearance",
    "pilot",
    "clearance-depth",
    "pilot-depth",
    ...participants,
  ],
  bolt: ["joint", "type", "diameter", "length", "hardware", "clearance", ...participants],
  glue: ["joint", "type", "surface", ...participants],
  load: ["member", "direction", "magnitude", ...location],
  support: ["member", "type", "bearing", ...location],
} satisfies Record<string, string[]>;

export type WoodKind = keyof typeof WOOD_FIELDS;
export const PROFILE_FIELDS: Partial<Record<WoodKind, string>> = {
  board: "stock",
  panel: "thickness",
  screw: "gauge",
  bolt: "diameter",
};
export const isWoodKind = (value: string): value is WoodKind => Object.hasOwn(WOOD_FIELDS, value);
export type WoodFacts = Record<string, string>;
export interface WoodPart {
  kind: WoodKind;
  facts: WoodFacts;
}
export type Parts = ReadonlyMap<string, WoodPart>;
export const PROJECTIONS = ["face", "edge", "end"] as const;
export type Projection = (typeof PROJECTIONS)[number];
export interface WoodView {
  part: string;
  projection: Projection;
}
export const AXES = ["length", "width", "thickness"] as const;
export type WoodAxis = (typeof AXES)[number];
export const isAxis = (axis: string): axis is WoodAxis => AXES.some((value) => value === axis);
export const WOOD_REFS = ["span", "left", "right", "member", "through", "into", "joint"];
export const isStock = (part: WoodPart) => part.kind === "board" || part.kind === "panel";
export function isWoodView(value: unknown): value is WoodView {
  return (
    !!value &&
    typeof value === "object" &&
    "part" in value &&
    typeof value.part === "string" &&
    "projection" in value &&
    PROJECTIONS.some((p) => p === value.projection)
  );
}

/** Fractions and mixed numbers stay in the file as entered. Compute in inches. */
export function shopInches(text: string): number | null {
  const input = text.trim();
  const match = /(in|ft|mm|cm|m|"|′|″|')$/i.exec(input);
  if (!match) return null;
  const amount = input.slice(0, match.index).trimEnd();
  const mixed = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(amount);
  let value: number;
  if (mixed) value = Number(mixed[1] ?? 0) + Number(mixed[2]) / Number(mixed[3]);
  else if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) value = Number(amount);
  else return null;
  const unit = match[1].toLowerCase().replace(/["″]/, "in").replace(/['′]/, "ft");
  const inches = value * (LENGTH_UNITS[unit] / LENGTH_UNITS.in);
  return Number.isFinite(inches) ? inches : null;
}
export function inchText(inches: number) {
  return `${Number(inches.toFixed(6))} in`;
}
export function worldPerInch(calibration: Calibration | null) {
  return calibration && Object.hasOwn(LENGTH_UNITS, calibration.unit)
    ? 1 / distanceFactor(calibration, "in")
    : 12;
}

const measures = new Set([
  "width",
  "length",
  "thickness",
  "measured-width",
  "measured-thickness",
  "diameter",
  "clearance",
  "pilot",
  "clearance-depth",
  "pilot-depth",
  "offset",
  "edge-offset",
  "inset",
  "left-inset",
  "right-inset",
]);

function measureError(key: string, value: string) {
  if (!measures.has(key)) return "";
  const amount = shopInches(value);
  const zeroAllowed = key.includes("offset") || key.includes("inset");
  return amount === null || (amount === 0 && !zeroAllowed)
    ? "enter " + key + " with a physical unit, such as 3/16 in or 18 mm."
    : "";
}
function profileError(key: string, value: string) {
  if (key === "stock" && !Object.hasOwn(LUMBER, value))
    return "unknown dry dressed stock " + value + ".";
  if (key === "gauge" && !Object.hasOwn(SCREWS, value))
    return "unknown wood screw gauge " + value + ".";
  if ((key.endsWith("-axis") || key === "occupies") && !isAxis(value))
    return "choose length, width or thickness for " + key + ".";
  if (key === "end" && !["A", "B"].includes(value)) return "reference end must be A or B.";
  return "";
}
function refError(key: string, value: string, parts: Parts) {
  if (!WOOD_REFS.includes(key)) return "";
  const target = parts.get(value);
  if (target && (key === "joint" ? target.kind === "joint" : isStock(target))) return "";
  return key + " refers to an unknown or incompatible part " + value + ".";
}
export function validField(kind: WoodKind, key: string) {
  const fields: readonly string[] = WOOD_FIELDS[kind];
  return key === "name" || fields.includes(key);
}
function participantError(f: WoodFacts, parts: Parts) {
  if (f.length && hasFit(f)) return "choose a literal length or a fit between faces.";
  if (f.through && f.through === f.into)
    return "the through and receiving pieces must be distinct.";
  const joint = parts.get(f.joint)?.facts;
  if (joint && ["through", "into"].some((key) => f[key] && joint[key] && f[key] !== joint[key]))
    return "participants must match joint " + f.joint + ".";
  return "";
}
export function checkPart(id: string, part: WoodPart, parts: Parts) {
  for (const [key, value] of Object.entries(part.facts)) {
    if (!validField(part.kind, key))
      return id + ": " + key + " is not editable on a " + part.kind + ".";
    const issue =
      measureError(key, value) || profileError(key, value) || refError(key, value, parts);
    if (issue) return id + ": " + issue;
  }
  const issue = participantError(part.facts, parts);
  return issue ? id + ": " + issue : "";
}
export interface Dimension {
  inches: number | null;
  basis: string;
}

const unknown = (basis: string): Dimension => ({ inches: null, basis });

function fitAxis(facts: WoodFacts, key: string, placement: WoodFacts | undefined) {
  return facts[key + "-axis"] || (key === "span" ? undefined : placement?.occupies);
}
function fitMember(
  parts: Parts,
  id: string,
  facts: WoodFacts,
  key: string,
  path: Set<string>
): Dimension[] {
  const member = facts[key];
  const placement = parts.get(member)?.facts;
  const axis = fitAxis(facts, key, placement);
  if (!axis || !isAxis(axis)) return [unknown("Specify " + id + " " + key + " piece and axis")];
  const size = woodDimension(parts, member, axis, path);
  if (key === "span") return [size];
  const inset = shopInches(facts[key + "-inset"] || placement?.inset || "");
  if (inset === null) return [size, unknown("Specify " + key + " inset (0 in for flush)")];
  return inset === 0 ? [size] : [size, { inches: inset, basis: inchText(inset) }];
}
function fittedLength(parts: Parts, id: string, facts: WoodFacts, path: Set<string>): Dimension {
  if (path.has(id)) return unknown("Circular fit at " + id);
  const chain = new Set(path).add(id);
  const dimensions = ["span", "left", "right"].flatMap((key) =>
    fitMember(parts, id, facts, key, chain)
  );
  const missing = dimensions.find((d) => d.inches === null);
  if (missing) return missing;
  const [outside, ...taken] = dimensions.map((d) => d.inches!);
  const result = outside - taken.reduce((sum, n) => sum + n, 0);
  const basis = dimensions.map((d) => inchText(d.inches!)).join(" − ");
  return result > 0 ? { inches: result, basis } : unknown("No clear span: " + basis);
}
export const hasFit = (facts: WoodFacts) => Boolean(facts.span || facts.left || facts.right);
export function woodDimension(
  parts: Parts,
  id: string,
  axis: WoodAxis,
  path = new Set<string>()
): Dimension {
  const part = parts.get(id);
  if (!part) return unknown(`Missing piece ${id}`);
  const f = part.facts;
  if (axis === "length" && hasFit(f)) return fittedLength(parts, id, f, path);
  if (part.kind === "board" && axis !== "length") {
    const profile = LUMBER[f.stock];
    return profile
      ? { inches: profile[axis === "thickness" ? 0 : 1], basis: f.stock }
      : unknown(`Specify stock on ${id}`);
  }
  const text = f[axis];
  return text ? { inches: shopInches(text), basis: text } : unknown(`Specify ${axis} on ${id}`);
}

export function projectionAxes(projection: Projection): [WoodAxis, WoodAxis] {
  if (projection === "end") return ["width", "thickness"];
  return ["length", projection === "face" ? "width" : "thickness"];
}
export function physicalSize(parts: Parts, view: WoodView, scale: number) {
  const part = parts.get(view.part);
  if (!part) return {};
  if (isStock(part)) {
    const [x, y] = projectionAxes(view.projection);
    const extent = (axis: WoodAxis) => woodDimension(parts, view.part, axis).inches;
    // Unknown cuts use a schematic extent. The cut list always names the missing input.
    return { width: (extent(x) ?? 8) * scale, height: (extent(y) ?? 3) * scale };
  }
  return hardwareSize(part, view, scale);
}
function hardwareSize(part: WoodPart, view: WoodView, scale: number) {
  if (part.kind === "screw" || part.kind === "bolt") {
    const f = part.facts;
    const diameter = part.kind === "screw" ? SCREWS[f.gauge] : shopInches(f.diameter ?? "");
    if (diameter)
      return {
        width: (view.projection === "end" ? diameter : (shopInches(f.length ?? "") ?? 2)) * scale,
        height: diameter * scale,
      };
  }
  return {};
}

function editableAxis(part: WoodPart, axis: WoodAxis) {
  if (axis === "length")
    return (isStock(part) || ["screw", "bolt"].includes(part.kind)) && !hasFit(part.facts);
  return axis === "width" && part.kind === "panel";
}
/** Return only physical dimensions this projection allows a resize handle to edit. */
export function resizeFacts(
  part: WoodPart,
  projection: Projection,
  width: number | undefined,
  height: number | undefined,
  scale: number
) {
  const changes: WoodFacts = {};
  const axes = projectionAxes(projection);
  for (const [index, size] of [width, height].entries()) {
    if (size === undefined || size <= 0 || !Number.isFinite(size)) continue;
    const axis = axes[index];
    if (editableAxis(part, axis)) changes[axis] = inchText(size / scale);
  }
  return changes;
}

export function cutList(parts: Parts) {
  return [...parts]
    .filter(([, part]) => isStock(part))
    .map(([id, part]) => {
      const dims = AXES.map((axis) => woodDimension(parts, id, axis));
      return {
        id,
        name: part.facts.name || id,
        stock: part.facts.stock || part.facts.material || part.kind,
        quantity: 1,
        dimensions: dims.map((d) => (d.inches === null ? d.basis : inchText(d.inches))).join(" × "),
        basis: dims[0].basis,
      };
    });
}

export function locationIssue(part: WoodPart, parts: Parts) {
  const f = part.facts;
  const member = f.member || f.through || parts.get(f.joint)?.facts.through;
  if (!member || !f.offset) return "";
  const size = woodDimension(parts, member, "length").inches;
  const offset = shopInches(f.offset);
  return size !== null && offset !== null && offset > size
    ? `${f.offset} from end ${f.end || "(unspecified)"} is outside ${member} (${inchText(size)} long).`
    : "";
}

/** Dependencies required to reproduce selected physical records in another document. */
export function partClosure(parts: Parts, seeds: Iterable<string>): Set<string> {
  const ids = new Set(seeds);
  for (const id of ids) {
    const part = parts.get(id);
    if (part) for (const key of WOOD_REFS) if (part.facts[key]) ids.add(part.facts[key]);
  }
  return ids;
}

export const WOOD_LABELS: Record<WoodKind, string> = {
  board: "Lumber",
  panel: "Sheet goods",
  screw: "Wood screw",
  bolt: "Bolt",
  glue: "Glue",
  joint: "Joint",
  load: "Point load",
  support: "Support",
};

export function renamePartRefs(part: WoodPart, aliases: ReadonlyMap<string, string>) {
  const facts = { ...part.facts };
  for (const key of WOOD_REFS) if (aliases.has(facts[key])) facts[key] = aliases.get(facts[key])!;
  return { kind: part.kind, facts };
}

/** Include operations attached entirely to the selected assembly, even without a callout. */
export function assemblySelection(parts: Parts, seeds: Iterable<string>) {
  const selected = new Set(seeds);
  if (!selected.size) return selected;
  let previous = -1;
  while (previous !== selected.size) {
    previous = selected.size;
    for (const [id, part] of parts) {
      if (selected.has(id) || isStock(part)) continue;
      const refs = ["member", "through", "into", "joint"]
        .map((key) => part.facts[key])
        .filter(Boolean);
      if (refs.length && refs.every((ref) => selected.has(ref))) selected.add(id);
    }
  }
  return selected;
}
