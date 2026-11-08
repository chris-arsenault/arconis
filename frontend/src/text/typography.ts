import type { TextFont } from "../document/types";
import type { Appearance } from "../document/appearance";

export const TEXT_FONTS: Record<TextFont, string> = {
  sans: "Inter, system-ui, sans-serif",
  serif: '"Source Serif 4", Georgia, serif',
  mono: '"Source Code Pro", monospace',
};

/** Browser previews and measurement consume semantic typography, never graph style encodings. */
export function applyTypography(element: HTMLElement, look: Appearance) {
  Object.assign(element.style, {
    fontFamily: TEXT_FONTS[look.font],
    fontSize: `${look.textSize}px`,
    fontWeight: look.bold ? "700" : "400",
    fontStyle: look.italic ? "italic" : "normal",
    color: look.textColor,
    textAlign: look.align,
    textDecoration: [look.underline ? "underline" : "", look.strike ? "line-through" : ""]
      .filter(Boolean)
      .join(" "),
    backgroundColor: /^#[\da-f]{3,8}$/i.test(look.textHighlight ?? "")
      ? look.textHighlight
      : "transparent",
  });
  element.style.setProperty("--text-line-height", String(look.lineHeight));
  element.style.setProperty("--text-paragraph-gap", `${look.paragraphGap}em`);
}
