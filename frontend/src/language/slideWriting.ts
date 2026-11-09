import type { Item } from "../document/types";
import { DEFAULT_DECK, nextSlideNumber } from "../document/slides";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Scope } from "./writing";

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
export function placeInDeck(draft: Draft, item: Item) {
  item.deck ||= DEFAULT_DECK;
  item.slide ??= nextSlideNumber(
    [...draft.items.values()].filter((other) => other.id !== item.id),
    item.deck
  );
}

/**
 * The scope of a slide's block: its items take default spots over the slide but stay in the
 * slide's own holder, and the block records them so they follow the slide while it settles.
 */
export function slideArea(slide: Item): Scope & { carried: string[] } {
  return { holder: slide.inside, previous: "", nested: false, area: slide.id, carried: [] };
}
