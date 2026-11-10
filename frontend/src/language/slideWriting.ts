import type { Item } from "../document/types";
import { DEFAULT_DECK, nextSlideNumber } from "../document/slides";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Scope } from "./writing";
import type { Attribute } from "./syntax";

/** The holder `in <id>` names; a slide is a viewport and holds nothing. */
export function resolveHolder(draft: Draft, ref: string, line: number) {
  if (ref === "none") return "";
  const id = draft.resolve(ref, line);
  if (draft.items.get(id)?.type === "slide")
    throw new LanguageError(
      `Slide "${id}" is a viewport and holds nothing; place the item over it instead.`,
      line
    );
  return id;
}

/** A new slide joins the default deck unless told otherwise, and takes the next number. */
export function placeInDeck(draft: Draft, item: Item, attributes: Attribute[]) {
  const numbered = attributes.some(
    (attribute) => attribute.kind === "deck" && attribute.numbering.kind === "number"
  );
  item.deck ||= DEFAULT_DECK;
  if (!numbered)
    item.slide = nextSlideNumber(
      [...draft.items.values()].filter((other) => other.id !== item.id),
      item.deck
    );
}

/**
 * The scope of a slide's block: its items take default spots over the slide but stay in the
 * slide's own holder, and the block records them so they follow the slide while it settles.
 */
export function slideArea(slide: Item): Extract<Scope, { kind: "slide" }> {
  return {
    kind: "slide",
    holder: slide.inside,
    previous: "",
    nested: false,
    area: slide.id,
    carried: [],
  };
}
