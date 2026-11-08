import { describe, expect, it } from "vitest";
import { CanvasDocument } from "./canvasDocument";
import { decks, deckSlides, newSlideValues, nextSlideNumber } from "./slides";

function slide(document: CanvasDocument, id: string, deck: string | undefined, number?: number) {
  document.insert(document.build("slide", 0, 0, { id, deck, slide: number }));
}

describe("decks", () => {
  it("orders slides by number, then by id, and names decks alphabetically", () => {
    const document = new CanvasDocument();
    slide(document, "b", "pitch", 2);
    slide(document, "a", "pitch", 2);
    slide(document, "c", "pitch", 1);
    slide(document, "late", "pitch", 10);
    slide(document, "x", "agenda", 1);
    slide(document, "unnumbered", undefined);
    document.insert(document.build("note", 0, 0));
    expect(
      decks(document.list()).map(({ deck, slides }) => [deck, slides.map((item) => item.id)])
    ).toEqual([
      ["agenda", ["x"]],
      ["deck", ["unnumbered"]],
      ["pitch", ["c", "a", "b", "late"]],
    ]);
    expect(deckSlides(document.list(), "agenda").map((item) => item.id)).toEqual(["x"]);
  });

  it("numbers a new slide after the highest in its deck", () => {
    const document = new CanvasDocument();
    expect(nextSlideNumber(document.list(), "pitch")).toBe(1);
    slide(document, "a", "pitch", 1);
    slide(document, "b", "pitch", 2.5);
    expect(nextSlideNumber(document.list(), "pitch")).toBe(3);
    expect(nextSlideNumber(document.list(), "other")).toBe(1);
  });

  it("gives a placed slide its deck, number, the deck's size and a place behind everything", () => {
    const document = new CanvasDocument();
    expect(newSlideValues(document.list(), [], "")).toEqual({ deck: "deck", slide: 1, order: 0 });
    document.insert(document.build("note", 0, 0, { order: 4 }));
    slide(document, "a", "pitch", 1);
    document.patch("a", { width: 1024, height: 768 });
    slide(document, "b", "agenda", 3);
    const items = document.list();
    // The selected slide's deck wins, with that deck's size.
    expect(newSlideValues(items, [document.get("a")!], "agenda")).toEqual({
      deck: "pitch",
      slide: 2,
      order: 3,
      width: 1024,
      height: 768,
    });
    // Then the deck last used here, when it still exists; then the first deck by name.
    expect(newSlideValues(items, [], "agenda")).toMatchObject({ deck: "agenda", slide: 4 });
    expect(newSlideValues(items, [], "gone")).toMatchObject({ deck: "agenda", slide: 4 });
  });
});
