import { isId } from "../document/ids";
import { STENCILS, type Item, type Stencil } from "../document/types";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Attribute } from "./syntax";

/** What an item is and how it looks, from the attributes that say so. */

interface Describing {
  draft: Draft;
  /** Sides given a size, as "<id> width" or "<id> height", which defaults must not replace. */
  sized: Set<string>;
  line: number;
}
type Describer<K extends Attribute["kind"]> = (
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

function lineOnly<K extends "via" | "label">(name: string): Describer<K> {
  return (_item, _attribute, { line }) => {
    throw new LanguageError(`Only a line takes ${name}.`, line);
  };
}

const DESCRIBE: { [K in Attribute["kind"]]?: Describer<K> } = {
  word: (item, attribute, context) => word(item, attribute.word, context),
  look: (item, attribute) => {
    item.look = { ...item.look, ...attribute.look };
    attribute.cleared.forEach((key) => delete item.look[key]);
  },
  icon: (item, attribute) => {
    item.icon = attribute.icon;
    if (item.type === "node") item.stencil = attribute.icon ? "icon" : "rectangle";
  },
  size: (item, attribute, { sized }) => {
    if (attribute.width !== undefined) {
      item.width = attribute.width;
      sized.add(`${item.id} width`);
    }
    if (attribute.height !== undefined) {
      item.height = attribute.height;
      sized.add(`${item.id} height`);
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
  via: lineOnly("via"),
  label: lineOnly("label-at"),
};

export function describeItem(item: Item, attributes: Attribute[], context: Describing) {
  for (const attribute of attributes) {
    const apply = DESCRIBE[attribute.kind] as Describer<Attribute["kind"]> | undefined;
    apply?.(item, attribute, context);
  }
}

/** A named look, which items use by name. Restating a style replaces it. */
export function declareStyle(draft: Draft, name: string, attributes: Attribute[], line: number) {
  if (!isId(name) || (STENCILS as readonly string[]).includes(name))
    throw new LanguageError(`"${name}" cannot name a style.`, line);
  const look = {};
  for (const attribute of attributes) {
    if (attribute.kind !== "look")
      throw new LanguageError("A style holds only look properties such as fill or dashed.", line);
    Object.assign(look, attribute.look);
  }
  draft.styles.set(name, look);
  draft.changedStyles.set(name, look);
}

/** `width of X` and `height of X`, read once X is placed. */
export function matchSizes(item: Item, attributes: Attribute[], context: Describing) {
  for (const attribute of attributes) {
    if (attribute.kind !== "match") continue;
    item[attribute.dimension] = context.draft.extent(attribute.ref, context.line).box[
      attribute.dimension
    ];
    context.sized.add(`${item.id} ${attribute.dimension}`);
  }
}
