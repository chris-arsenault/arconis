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
  joint: ["type", "width", "depth", "length", "bearing", ...participants],
  screw: [
    "joint",
    "bracket",
    "gauge",
    "type",
    "length",
    "clearance",
    "pilot",
    "clearance-depth",
    "pilot-depth",
    ...participants,
  ],
  bolt: [
    "joint",
    "bracket",
    "type",
    "diameter",
    "thread",
    "length",
    "hardware",
    "clearance",
    ...participants,
  ],
  bracket: [
    "type",
    "joint",
    "length",
    "projection",
    "width",
    "thickness",
    "material",
    ...participants,
  ],
  washer: ["type", "fastener", "side", "size", "outer-diameter", "bore", "thickness", "material"],
  nut: ["type", "fastener", "size", "thread", "material"],
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
  joint: "type",
  bracket: "type",
  washer: "type",
  nut: "type",
};
export const isWoodKind = (value: string): value is WoodKind => Object.hasOwn(WOOD_FIELDS, value);

export const WOOD_LABELS: Record<WoodKind, string> = {
  board: "Lumber",
  panel: "Sheet goods",
  screw: "Wood screw",
  bolt: "Bolt",
  bracket: "Bracket",
  washer: "Washer",
  nut: "Nut",
  glue: "Glue",
  joint: "Joint",
  load: "Point load",
  support: "Support",
};

/** Presets populate editable type fields in the same physical records used by files and MCP. */
export const JOINERY_AND_FITTINGS = {
  joint: [
    "Butt joint",
    "Miter joint",
    "Dado",
    "Rabbet",
    "Half-lap joint",
    "Mortise and tenon",
    "Dovetail",
    "Dowel joint",
    "Biscuit joint",
    "Pocket-hole joint",
  ],
  bracket: ["Angle bracket", "Shelf bracket", "Mending plate"],
  washer: ["Flat washer", "Fender washer", "Lock washer"],
  nut: ["Hex nut", "Lock nut", "Wing nut", "T-nut"],
} satisfies Partial<Record<WoodKind, string[]>>;

const woodPresets = Object.entries(JOINERY_AND_FITTINGS).flatMap(([key, types]) =>
  types.map((type) => ({ kind: key as keyof typeof JOINERY_AND_FITTINGS, type }))
);

export function findWoodPresets(query: string) {
  const words = query
    .toLowerCase()
    .split(/[\s,-]+/)
    .filter(Boolean);
  return woodPresets.filter(({ kind, type }) => {
    const family = kind === "joint" ? "joinery" : "hardware fittings";
    const terms = ["woodworking", family, kind + "s", type.toLowerCase().replaceAll("-", " ")].join(
      " "
    );
    return words.every((word) => terms.includes(word));
  });
}
