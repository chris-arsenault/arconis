import { decks, deckOf, isSlide, presentedSlides, DEFAULT_DECK } from "../document/slides";
import type { Item } from "../document/types";
import { deckPage } from "../files/deckPage";
import { downloadFile } from "../files/download";
import type { EditorController } from "./controller";
import { exportTextCss } from "./exportText";
import { inlinePictures, renderRegion } from "./pngExport";

/** Taking a deck out as one HTML file that shows its slides in any browser. */

const SVG = "http://www.w3.org/2000/svg";

/** A drawn slide as an SVG element that scales to whatever room the page gives it. */
function slideSvg({ pane, width, height }: ReturnType<typeof renderRegion>) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const paper = document.createElementNS(SVG, "rect");
  paper.setAttribute("width", "100%");
  paper.setAttribute("height", "100%");
  paper.setAttribute("fill", "#ffffff");
  svg.append(paper, pane);
  return svg;
}

/**
 * The gradients and clips the slides draw from, taken out of each and kept once for the page: a
 * slide that is not shown is not laid out, and could not lend them to the one that is.
 */
function sharedDefinitions(drawn: SVGSVGElement[]) {
  const shared = document.createElementNS(SVG, "svg");
  shared.setAttribute("class", "shared");
  shared.setAttribute("aria-hidden", "true");
  const kept = document.createElementNS(SVG, "defs");
  const seen = new Set<string>();
  for (const own of drawn.flatMap((svg) => [...svg.querySelectorAll(":scope > g > defs")])) {
    for (const definition of [...own.children]) {
      if (definition.id && seen.has(definition.id)) continue;
      seen.add(definition.id);
      kept.append(definition);
    }
    own.remove();
  }
  shared.append(kept);
  return shared;
}

/**
 * The deck as a self-contained HTML document, or null when it has no slides to show. The slides
 * are drawn as a presentation shows them: no slide outlines, templates at full strength, and no
 * markup or speaker notes.
 */
export async function deckHtml(editor: EditorController, deck: string) {
  const slides = presentedSlides(editor.document.list(), deck);
  if (!slides.length) return null;
  await document.fonts.ready;
  const drawn = editor.presenter.asPresented(() =>
    slides.map((slide) => slideSvg(renderRegion(editor.graph, slide)))
  );
  // Pictures and fonts are gathered once for the whole deck rather than once a slide.
  const all = document.createElement("div");
  all.append(sharedDefinitions(drawn), ...drawn);
  await inlinePictures(all);
  const title = editor.document.title();
  return deckPage({
    title: deck === DEFAULT_DECK ? title : `${title} · ${deck}`,
    slides: slides.map((slide, index) => ({ name: slide.name, svg: drawn[index].outerHTML })),
    css: await exportTextCss(all),
    definitions: all.firstElementChild!.outerHTML,
    size: slides[0],
  });
}

/** Downloads the deck as an HTML file, saying so, or why not. */
export async function exportDeck(editor: EditorController, deck: string) {
  const room = editor.room;
  try {
    const html = await deckHtml(editor, deck);
    if (!html) {
      room?.setNotice("This deck has no slides to export.");
      return;
    }
    downloadFile(editor.document, html, "text/html", "html", deck === DEFAULT_DECK ? "" : deck);
    room?.setNotice("Deck exported. It opens in any browser.");
  } catch {
    room?.setNotice("The deck could not be exported.");
  }
}

/** The decks that have slides to show, by name. */
export function exportableDecks(items: Item[]) {
  return decks(items)
    .map(({ deck }) => deck)
    .filter((deck) => presentedSlides(items, deck).length > 0);
}

/** The deck a choice starts on: the selected slide's when it can be exported, else the first. */
export function preferredDeck(items: Item[], selected: Item[]) {
  const names = exportableDecks(items);
  return (
    selected
      .filter(isSlide)
      .map(deckOf)
      .find((deck) => names.includes(deck)) ?? names[0]
  );
}

/** Exports the room's deck. A room with several asks which, in a dialog over the canvas. */
export function chooseDeckExport(editor: EditorController) {
  const names = exportableDecks(editor.document.list());
  if (names.length === 1) void exportDeck(editor, names[0]);
  if (names.length < 2) return;
  editor.ui.deckExport = true;
  editor.emit();
}

export function closeDeckChooser(editor: EditorController) {
  editor.ui.deckExport = false;
  editor.emit();
}
