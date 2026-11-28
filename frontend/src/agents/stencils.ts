import {
  LUMBER,
  SHEET_THICKNESSES,
  SCREWS,
  WOOD_FIELDS,
  WOOD_LABELS,
  type WoodKind,
} from "../document/woodworking";
import { ICON_VENDORS } from "../document/geometry";
import { STENCILS } from "../document/types";
import { loadAllVendors, loadIcons, searchIcons } from "../assets/icons/catalog";

function woodStencils(query = "woodworking") {
  const words = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  const all = words.includes("woodworking");
  const matches = (terms: string) =>
    all || words.some((word) => terms.toLowerCase().includes(word));
  const types = Object.entries(WOOD_LABELS)
    .filter(([kind, label]) => matches(kind + " " + label))
    .map(([kind, label]) => ({ kind, label, fields: WOOD_FIELDS[kind as WoodKind] }));
  const lumber = Object.entries(LUMBER)
    .filter(([stock]) => matches("board lumber " + stock))
    .map(([stock, [thickness, width]]) => ({
      stock,
      thickness,
      width,
      unit: "in",
      editable: "length",
    }));
  const screws = Object.entries(SCREWS)
    .filter(([gauge]) => matches("wood screw " + gauge))
    .map(([gauge, diameter]) => ({ gauge, diameter, unit: "in", editable: "length" }));
  const sheetThicknesses = matches("panel sheet goods") ? SHEET_THICKNESSES : [];
  return { types, lumber, screws, sheetThicknesses };
}
export async function stencils(query: string | undefined) {
  if (!query?.trim())
    return {
      stencils: STENCILS,
      woodworking: woodStencils(),
      iconSets: ["lucide", "brand", ...ICON_VENDORS],
      iconHint: "Search with a query, such as 'lock server database', to find icon keys.",
    };
  await Promise.all([loadIcons(), loadAllVendors()]);
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    ),
  ].slice(0, 8);
  return {
    woodworking: woodStencils(query),
    icons: Object.fromEntries(
      words.map((word) => {
        const found = searchIcons(word, 13);
        return [
          word,
          {
            matches: found.slice(0, 12).map(({ key, title }) => ({ key, title })),
            more: found.length > 12,
          },
        ];
      })
    ),
  };
}
