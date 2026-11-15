import { ICON_VENDORS } from "../document/geometry";
import { STENCILS } from "../document/types";
import { loadAllVendors, loadIcons, searchIcons } from "../assets/icons/catalog";

export async function stencils(query: string | undefined) {
  if (!query?.trim())
    return {
      stencils: STENCILS,
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
