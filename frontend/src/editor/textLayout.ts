import type { CanvasDocument } from "../document/canvasDocument";
import { effectiveAppearance, type Appearance } from "../document/appearance";
import { textCanResize } from "../document/capabilities";
import { renderMarkdown } from "../text/markdown";
import type { Item } from "../document/types";
import { applyTypography } from "../text/typography";

/** Measure only the label being authored, in comfortable CSS pixels even at deep canvas scales. */
export async function fitText(canvas: CanvasDocument, id: string, growingOnly = false) {
  await document.fonts.ready;
  const item = canvas.get(id);
  if (!item) return;
  const look = effectiveAppearance(item, canvas.namedStyle(item.style));
  const height = fittedTextHeight(item, look, growingOnly);
  if (height !== null) canvas.patch(id, { height });
}

/** Call after fonts are ready; measuring is a query so a command can commit its result atomically. */
export function fittedTextHeight(item: Item, look: Appearance, growingOnly = false): number | null {
  if (!textCanResize(item) || (growingOnly && look.textFit !== "height")) return null;
  const height = measureHeight(item, look, look.scale);
  return Number.isFinite(height) && height > 0 && height !== item.height ? height : null;
}

function measureHeight(item: Item, look: Appearance, scale: number) {
  const padding = look.padding;
  const size = look.textSize;
  const measure = document.createElement("div");
  measure.className = "canvas-markdown";
  applyTypography(measure, look);
  Object.assign(measure.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    width: `${Math.max(size, item.width / scale - padding * 2)}px`,
    lineHeight: String(look.lineHeight),
  });
  measure.innerHTML = renderMarkdown(item.name);
  document.body.append(measure);
  const contentHeight = measure.getBoundingClientRect().height;
  measure.remove();
  return Math.ceil((Math.max(size * 1.35, contentHeight) + padding * 2) * scale * 1e6) / 1e6;
}
