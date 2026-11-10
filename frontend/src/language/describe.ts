import { isId } from "../document/ids";
import { isFrame, STENCILS, type Item, type Stencil } from "../document/types";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Attribute } from "./syntax";
import { attributesFor, checkAttributes, type RoutedAttribute } from "./attributeRouting";
import { FIELD_DESCRIBERS } from "./fields";
import { assignLayer } from "./layerWriting";

/** What an item is and how it looks, from the attributes that say so. */

interface Describing {
  draft: Draft;
  /** Sides given a size, as "<id> width" or "<id> height", which defaults must not replace. */
  sized: Set<string>;
  line: number;
}
type Described = RoutedAttribute<"item", "describe" | "arrange">;
export function givenSize(item: Item, sized: Set<string>) {
  return { width: sized.has(`${item.id} width`), height: sized.has(`${item.id} height`) };
}
type Describer<K extends Described["kind"]> = (
  item: Item,
  attribute: Extract<Attribute, { kind: K }>,
  context: Describing
) => void;

/** A bare word: a node's stencil, or a named style. */
function word(item: Item, text: string, { draft, line }: Describing) {
  if ((STENCILS as readonly string[]).includes(text)) {
    if (item.type !== "node")
      throw new LanguageError(
        `A ${item.type} has no stencil; "${text}" is a node's stencil.`,
        line
      );
    item.stencil = text as Stencil;
    return;
  }
  if (draft.styles.has(text)) {
    item.style = text;
    return;
  }
  const styles = [...draft.styles.keys()];
  const known = styles.length
    ? `Styles: ${styles.join(", ")}.`
    : "Declare a style with: style <name> <look>.";
  throw new LanguageError(
    `"${text}" is not a stencil, a style or an attribute. Stencils: ${STENCILS.join(", ")}. ${known}`,
    line
  );
}

const DESCRIBE: { [K in Described["kind"]]: Describer<K> } = {
  ...FIELD_DESCRIBERS,
  scaleContents: (item, attribute, { line }) => {
    if (!isFrame(item))
      throw new LanguageError("Only a frame or group scales its contents on resize.", line);
    item.scaleContents = attribute.value;
  },
  markup: (item, attribute, { line }) => {
    if (item.type !== "drawing" && item.type !== "highlight")
      throw new LanguageError("Only drawings and highlights belong to markup.", line);
    item.markup = attribute.value;
    if (attribute.value) item.layer = "";
  },
  ink: (item, attribute, { line }) => {
    if (item.type !== "drawing") throw new LanguageError("Only a drawing has ink geometry.", line);
    item.ink = attribute.ink;
  },
  layer: (item, attribute, { draft, line }) => assignLayer(draft, item, attribute.ref, line),
  target: (item, attribute, { draft, line }) => {
    if (item.type !== "highlight") throw new LanguageError("Only a highlight has a target.", line);
    draft.highlights.push({ id: item.id, ref: attribute.ref, line });
  },
  word: (item, attribute, context) => word(item, attribute.word, context),
  look: (item, attribute) => {
    item.look = { ...item.look, ...attribute.look };
    attribute.cleared.forEach((key) => delete item.look[key]);
  },
  icon: (item, attribute) => {
    item.icon = attribute.icon;
    if (item.type === "node") item.stencil = attribute.icon ? "icon" : "rectangle";
  },
  size: (item, { dimensions }, { sized }) => {
    const values =
      dimensions.kind === "both"
        ? { width: dimensions.width, height: dimensions.height }
        : { [dimensions.kind]: dimensions.value };
    for (const dimension of ["width", "height"] as const) {
      const value = values[dimension];
      if (value === undefined) continue;
      item[dimension] = value;
      sized.add(`${item.id} ${dimension}`);
    }
  },
  picture: (item, attribute, { line }) => {
    if (item.type !== "picture") throw new LanguageError("Only a picture has a hash.", line);
    item.picture = { hash: attribute.hash, format: attribute.format, stored: attribute.stored };
  },
  points: (item, attribute) => {
    item.points = attribute.points;
  },
  // The line may be declared later, so the reference resolves once every line exists.
  on: (item, attribute, { draft, line }) => {
    draft.anchors.push({ id: item.id, ref: attribute.ref, line });
  },
  // A frame or group keeps its arrangement; anything else is arranged once.
  arrange: (item, attribute) => {
    if (item.type !== "frame" && item.type !== "group") return;
    item.arrange =
      attribute.how === "grid"
        ? { how: "grid", columns: attribute.columns, gap: attribute.gap, align: "center" }
        : { how: attribute.how, gap: attribute.gap, align: attribute.align };
  },
  free: (item) => {
    item.arrange = { how: "free" };
  },
  deck: (item, attribute, { line }) => {
    if (item.type !== "slide")
      throw new LanguageError(
        `Only a slide belongs to a deck; ${item.id} is a ${item.type}.`,
        line
      );
    item.deck = attribute.deck;
    if (attribute.numbering.kind === "number") item.slide = attribute.numbering.value;
  },
};

export function describeItem(item: Item, attributes: Attribute[], context: Describing) {
  checkAttributes("item", attributes, context.line);
  for (const attribute of attributesFor(attributes, "item", ["describe", "arrange"])) {
    const apply = DESCRIBE[attribute.kind] as Describer<Described["kind"]>;
    apply(item, attribute, context);
  }
}

/** A named look, which items use by name. Restating a style replaces it. */
export function declareStyle(draft: Draft, name: string, attributes: Attribute[], line: number) {
  if (!isId(name) || (STENCILS as readonly string[]).includes(name))
    throw new LanguageError(`"${name}" cannot name a style.`, line);
  const look = {};
  checkAttributes("style", attributes, line);
  for (const attribute of attributesFor(attributes, "style", "style")) {
    Object.assign(look, attribute.look);
  }
  draft.styles.set(name, look);
  draft.changedStyles.set(name, look);
}

/** `width of X` and `height of X`, read once X is placed. */
export function matchSizes(item: Item, attributes: Attribute[], context: Describing) {
  for (const attribute of attributesFor(attributes, "item", "match")) {
    item[attribute.dimension] = context.draft.extent(attribute.ref, context.line).box[
      attribute.dimension
    ];
    context.sized.add(`${item.id} ${attribute.dimension}`);
  }
}
