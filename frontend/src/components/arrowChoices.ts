import type { Arrow } from "../document/types";

/** Every line end people can choose, grouped as draw.io's start and end menus group them. */
export const ARROW_GROUPS: { title: string; arrows: { value: Arrow; label: string }[] }[] = [
  {
    title: "Arrows",
    arrows: [
      { value: "none", label: "None" },
      { value: "arrow", label: "Arrow" },
      { value: "open", label: "Open arrow" },
      { value: "classic", label: "Classic arrow" },
      { value: "thin", label: "Thin arrow" },
      { value: "triangle", label: "Hollow triangle" },
    ],
  },
  {
    title: "Shapes",
    arrows: [
      { value: "dot", label: "Dot" },
      { value: "circle", label: "Circle" },
      { value: "diamond", label: "Diamond" },
      { value: "hollow-diamond", label: "Hollow diamond" },
      { value: "bar", label: "Bar" },
      { value: "cross", label: "Cross" },
    ],
  },
  {
    title: "Relationship cardinality",
    arrows: [
      { value: "one", label: "One" },
      { value: "only-one", label: "Only one" },
      { value: "many", label: "Many" },
      { value: "one-or-many", label: "One or many" },
      { value: "zero-or-one", label: "Zero or one" },
      { value: "zero-or-many", label: "Zero or many" },
    ],
  },
];

const LABELS = new Map(
  ARROW_GROUPS.flatMap((group) => group.arrows).map(({ value, label }) => [value, label])
);
export const arrowLabel = (arrow: Arrow) => LABELS.get(arrow) ?? arrow;
