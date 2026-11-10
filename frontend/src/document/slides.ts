import type { Item } from "./types";

/**
 * A slide is a fixed-size viewport over the canvas. A deck is the name its slides share, and a
 * slide's number orders it in the deck; gaps and ties change nothing, because order falls back to
 * the id.
 */
export const DEFAULT_DECK = "deck";

export interface SlideSize {
  name: string;
  width: number;
  height: number;
}
/** Common slide proportions, in canvas units. */
export const SLIDE_SIZES: SlideSize[] = [
  { name: "Wide 16:9", width: 1280, height: 720 },
  { name: "Standard 4:3", width: 1024, height: 768 },
];

export interface Deck {
  deck: string;
  /** The deck's slides in presenting order. */
  slides: Item[];
}

/**
 * The number of a deck's template. What a template frames is drawn under every other slide of its
 * deck, at the same place within each, and a presentation skips the template itself.
 */
export const TEMPLATE_NUMBER = 0;

export function isSlide(item: Pick<Item, "type"> | null | undefined) {
  return item?.type === "slide";
}

export function isTemplate(item: Item) {
  return isSlide(item) && item.slide === TEMPLATE_NUMBER;
}

export function deckOf(item: Item) {
  return item.deck || DEFAULT_DECK;
}

export function compareSlides(a: Item, b: Item) {
  return a.slide - b.slide || a.id.localeCompare(b.id);
}

/** Every deck with its slides in order, decks by name. */
export function decks(items: Item[]): Deck[] {
  const byDeck = new Map<string, Item[]>();
  for (const item of items.filter(isSlide))
    byDeck.set(deckOf(item), [...(byDeck.get(deckOf(item)) ?? []), item]);
  return [...byDeck]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([deck, slides]) => ({ deck, slides: [...slides].sort(compareSlides) }));
}

export function deckSlides(items: Item[], deck: string) {
  return items.filter((item) => isSlide(item) && deckOf(item) === deck).sort(compareSlides);
}

/** The slides a presentation of the deck walks: its slides in order, without templates. */
export function presentedSlides(items: Item[], deck: string) {
  return deckSlides(items, deck).filter((slide) => !isTemplate(slide));
}

/** The number a slide added to this deck takes: one past the highest, or 1. */
export function nextSlideNumber(items: Item[], deck: string) {
  const numbers = deckSlides(items, deck).map((slide) => slide.slide);
  return numbers.length ? Math.floor(Math.max(...numbers)) + 1 : 1;
}

/**
 * What a slide someone places takes: the deck of the selected slide, else the deck last used here,
 * else the first deck, else the default; the next number in it; the size of that deck's last slide,
 * so a deck keeps one shape; and a place behind everything, so it covers nothing.
 */
export function newSlideValues(items: Item[], selected: Item[], lastDeck: string): Partial<Item> {
  const all = decks(items);
  const deck =
    selected.filter(isSlide).map(deckOf)[0] ??
    (all.some((candidate) => candidate.deck === lastDeck) ? lastDeck : undefined) ??
    all[0]?.deck ??
    DEFAULT_DECK;
  const last = deckSlides(items, deck).at(-1);
  const orders = items.map((item) => item.order);
  return {
    deck,
    slide: nextSlideNumber(items, deck),
    order: orders.length ? Math.min(...orders) - 1 : 0,
    ...(last ? { width: last.width, height: last.height } : {}),
  };
}
