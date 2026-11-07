import { DEFAULT_GAP, type Box } from "./layout";
import type { Attribute, Edge } from "./syntax";

/**
 * An item's two boxes: `box` is the item itself, `space` adds labels drawn outside it. Gaps between
 * items are measured between spaces, and alignment between boxes, so icons line up while their
 * labels stay clear of one another.
 */
export interface Extent {
  box: Box;
  space: Box;
}

/** Where an item's box goes on one axis. A `sized` rule needs the item's final size. */
export interface AxisRule {
  sized: boolean;
  value: (own: Extent) => number;
}
export interface Rules {
  x?: AxisRule;
  y?: AxisRule;
}

const fixed = (value: number): AxisRule => ({ sized: false, value: () => value });
const sized = (value: (own: Extent) => number): AxisRule => ({ sized: true, value });
/** How far a box's left edge sits inside its space. */
const inset = (own: Extent) => own.box.x - own.space.x;

/**
 * A holder lines up with an edge of what it is beside rather than its center, because its size is
 * only known once its contents are placed, and centering it then would move contents that were
 * aligned with items elsewhere.
 */
function besideRules(direction: string, target: Extent, gap: number, holder: boolean): Rules {
  const { box, space } = target;
  const centerX = holder ? fixed(box.x) : sized((own) => box.x + (box.width - own.box.width) / 2);
  const middleY = holder ? fixed(box.y) : sized((own) => box.y + (box.height - own.box.height) / 2);
  switch (direction) {
    case "below":
      return { x: centerX, y: fixed(space.y + space.height + gap) };
    case "above":
      return { x: centerX, y: sized((own) => space.y - gap - own.space.height) };
    case "right of":
      return {
        x: { sized: false, value: (own) => space.x + space.width + gap + inset(own) },
        y: middleY,
      };
    default:
      return {
        x: sized((own) => space.x - gap - own.space.width + inset(own)),
        y: middleY,
      };
  }
}

function alignRules(edge: Edge, { box }: Extent): Rules {
  switch (edge) {
    case "left":
      return { x: fixed(box.x) };
    case "center":
      return { x: sized((own) => box.x + (box.width - own.box.width) / 2) };
    case "right":
      return { x: sized((own) => box.x + box.width - own.box.width) };
    case "top":
      return { y: fixed(box.y) };
    case "middle":
      return { y: sized((own) => box.y + (box.height - own.box.height) / 2) };
    default:
      return { y: sized((own) => box.y + box.height - own.box.height) };
  }
}

/**
 * The rules a placement attribute sets. `target` finds a named item's extent; `holder` is true for
 * an item whose block places contents inside it.
 */
export function placementRules(
  attribute: Attribute,
  target: (ref: string) => Extent,
  holder = false
): Rules {
  switch (attribute.kind) {
    case "at":
      return { x: fixed(attribute.x), y: fixed(attribute.y) };
    case "beside":
      return besideRules(
        attribute.direction,
        target(attribute.ref),
        attribute.gap ?? DEFAULT_GAP,
        holder
      );
    case "align":
      return alignRules(attribute.edge, target(attribute.ref));
    default:
      return {};
  }
}

/** Combines rules in order; a later rule for an axis replaces an earlier one. */
export function combineRules(
  attributes: Attribute[],
  target: (ref: string) => Extent,
  holder = false
): Rules {
  const rules: Rules = {};
  for (const attribute of attributes) {
    const set = placementRules(attribute, target, holder);
    if (set.x) rules.x = set.x;
    if (set.y) rules.y = set.y;
  }
  return rules;
}

/** Offset across a row or column for an item, by how the arrangement aligns its members. */
export function crossOffset(align: Edge | undefined, extent: number, size: number) {
  if (align === "top" || align === "left") return 0;
  if (align === "bottom" || align === "right") return extent - size;
  return (extent - size) / 2;
}
