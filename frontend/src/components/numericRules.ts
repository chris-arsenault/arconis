export type NumericValue = number | "mixed";
export interface NumericRules {
  minimum: number;
  positive: boolean;
  integer: boolean;
  increment: number | "any";
  arithmetic: boolean;
}
export const PLAIN_NUMBER: NumericRules = {
  minimum: -Infinity,
  positive: false,
  integer: false,
  increment: "any",
  arithmetic: false,
};
export const POSITIVE_NUMBER: NumericRules = { ...PLAIN_NUMBER, positive: true };
export const SLIDE_NUMBER: NumericRules = { ...PLAIN_NUMBER, minimum: 0, integer: true };
export const GEOMETRY_NUMBER: NumericRules = { ...PLAIN_NUMBER, arithmetic: true };
export const SIZE_NUMBER: NumericRules = { ...GEOMETRY_NUMBER, positive: true };
export const LINE_WIDTH_NUMBER: NumericRules = { ...GEOMETRY_NUMBER, minimum: 0 };
export const TEXT_SPACING: Record<"lineHeight" | "paragraphGap" | "padding", NumericRules> = {
  lineHeight: { ...POSITIVE_NUMBER, increment: 0.05 },
  paragraphGap: { ...PLAIN_NUMBER, minimum: 0, increment: 0.1 },
  padding: { ...PLAIN_NUMBER, minimum: 0, increment: 1 },
};
