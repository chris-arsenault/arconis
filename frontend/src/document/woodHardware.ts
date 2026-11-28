import type { Parts, WoodKind } from "./woodworking";
import { WOOD_LABELS } from "./woodCatalog";

const specifications: Partial<Record<WoodKind, string[]>> = {
  screw: ["gauge", "length"],
  bolt: ["diameter", "thread", "length"],
  bracket: ["length", "projection", "width", "thickness", "material"],
  washer: ["size", "outer-diameter", "bore", "thickness", "material"],
  nut: ["size", "thread", "material"],
};

/** Count physical records with identical authored specifications across every view. */
export function hardwareList(parts: Parts) {
  const rows = new Map<string, { label: string; details: string; quantity: number }>();
  for (const { kind, facts } of parts.values()) {
    const fields = specifications[kind];
    if (!fields) continue;
    const label = facts.type || WOOD_LABELS[kind];
    const specs = fields.filter((field) => facts[field]).map((field) => [field, facts[field]]);
    const key = JSON.stringify([kind, label, specs]);
    const row = rows.get(key);
    if (row) row.quantity++;
    else
      rows.set(key, { label, details: specs.map(([k, v]) => k + " " + v).join(", "), quantity: 1 });
  }
  return [...rows.values()];
}
