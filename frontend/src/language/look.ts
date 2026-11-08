import type { Look } from "../document/types";

type Definition<Value> = { word: string } & ([Value] extends [boolean]
  ? { kind: "flag" }
  : [Value] extends [number]
    ? { kind: "number"; range: "finite" | "positive" | "nonnegative" }
    : [Value] extends [string]
      ? string extends Value
        ? { kind: "color" | "icon" }
        : { kind: "choice"; choices: Record<Value & string, true> }
      : never);

/** In canonical print order. Every model look key and every choice belongs to this codec. */
const LOOK = {
  fill: { word: "fill", kind: "color" },
  line: { word: "line", kind: "color" },
  lineWidth: { word: "line-width", kind: "number", range: "finite" },
  dashed: { word: "dashed", kind: "flag" },
  opacity: { word: "opacity", kind: "number", range: "finite" },
  strokeOpacity: { word: "stroke-opacity", kind: "number", range: "nonnegative" },
  closed: { word: "closed", kind: "flag" },
  gradient: { word: "gradient", kind: "color" },
  gradientAngle: { word: "gradient-angle", kind: "number", range: "finite" },
  textColor: { word: "text-color", kind: "color" },
  textSize: { word: "text-size", kind: "number", range: "positive" },
  font: { word: "font", kind: "choice", choices: { sans: true, serif: true, mono: true } },
  valign: { word: "valign", kind: "choice", choices: { top: true, middle: true, bottom: true } },
  textHighlight: { word: "text-highlight", kind: "color" },
  lineHeight: { word: "line-height", kind: "number", range: "positive" },
  paragraphGap: { word: "paragraph-gap", kind: "number", range: "nonnegative" },
  padding: { word: "padding", kind: "number", range: "nonnegative" },
  textFit: { word: "text-fit", kind: "choice", choices: { fixed: true, height: true } },
  bold: { word: "bold", kind: "flag" },
  italic: { word: "italic", kind: "flag" },
  underline: { word: "underline", kind: "flag" },
  strike: { word: "strike", kind: "flag" },
  align: { word: "align", kind: "choice", choices: { left: true, center: true, right: true } },
  vertical: { word: "vertical", kind: "flag" },
  rotation: { word: "rotate", kind: "number", range: "finite" },
  iconColor: { word: "icon-color", kind: "color" },
  badge: { word: "badge", kind: "icon" },
  title: { word: "title", kind: "choice", choices: { header: true, top: true, side: true } },
  path: { word: "path", kind: "choice", choices: { cornered: true, diagonal: true, curved: true } },
  arrow: { word: "arrow", kind: "choice", choices: { arrow: true, open: true, none: true } },
  startArrow: {
    word: "start-arrow",
    kind: "choice",
    choices: { arrow: true, open: true, none: true },
  },
  scale: { word: "scale", kind: "number", range: "positive" },
} as const satisfies { [Key in keyof Look]-?: Definition<NonNullable<Look[Key]>> };

export type LookDefinition = (typeof LOOK)[keyof typeof LOOK];
/** Object reflection loses key names; the typed descriptor above owns this single conversion. */
export const lookEntries = Object.entries(LOOK) as [keyof Look, LookDefinition][];
const BY_WORD = new Map<string, { key: keyof Look; definition: LookDefinition }>(
  lookEntries.map(([key, definition]) => [definition.word, { key, definition }])
);

export function lookAttribute(word: string) {
  return BY_WORD.get(word);
}
