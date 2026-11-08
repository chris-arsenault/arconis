import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { deckSlides } from "../document/slides";
import type { Item } from "../document/types";
import { fittingView, flyToView } from "./views";

/** What a presentation needs from the editor, so it can be driven without a graph in tests. */
export interface Stage {
  document: CanvasDocument;
  /** Fits a slide's box to the window, or snaps to it without animation. */
  show(slide: Item, animate: boolean): void;
  /** Leaves editing state behind: selection, inline editor, tool. */
  clear(): void;
  /** Draws the document again, because slides draw differently while presenting. */
  project(): void;
  emit(): void;
}

/**
 * One person's presentation of a deck. It is local state, not the document's: peers are unaffected,
 * and the deck's slides are read from the document on every call, so slides others add or remove
 * show up at once.
 */
export class Presenter {
  deck: string | null = null;
  private slideId = "";
  /** Where the shown slide sat, to fall back to a neighbour when it is removed. */
  private position = 0;

  constructor(private readonly stage: Stage) {}

  get active() {
    return this.deck !== null;
  }

  slides() {
    return this.deck === null ? [] : deckSlides(this.stage.document.list(), this.deck);
  }

  /** The slide shown: the current one, or the nearest remaining when it was removed. */
  slide(): Item | null {
    const slides = this.slides();
    const current = slides.find((candidate) => candidate.id === this.slideId);
    if (current) return current;
    return slides[Math.min(this.position, slides.length - 1)] ?? null;
  }

  /** The shown slide's place in the deck, counted from one, for a "3 / 12" counter. */
  index() {
    const slide = this.slide();
    return slide ? this.slides().indexOf(slide) + 1 : 0;
  }

  /** Begins at a slide, or the deck's first. The stage fits it once the chrome has gone. */
  start(deck: string, slideId = "") {
    this.deck = deck;
    this.slideId = slideId;
    this.position = 0;
    this.settle();
    this.stage.clear();
    this.stage.project();
    this.stage.emit();
  }

  stop() {
    this.deck = null;
    this.slideId = "";
    this.stage.project();
    this.stage.emit();
  }

  /** Moves by `step` slides, staying within the deck. */
  go(step: number) {
    const slides = this.slides();
    const target = slides[this.index() - 1 + step];
    if (!target) return;
    this.slideId = target.id;
    this.settle();
    this.refit(true);
    this.stage.emit();
  }

  /** Fits the shown slide again, after the window or the layout around it changed. */
  refit(animate = false) {
    const slide = this.slide();
    if (slide) this.stage.show(slide, animate);
  }

  /** Remembers the shown slide's identity and place, whichever of the two was given. */
  private settle() {
    const slide = this.slide();
    this.slideId = slide?.id ?? "";
    this.position = slide ? this.slides().indexOf(slide) : 0;
  }
}

/** The stage an editor offers: the graph fitted to a slide with the mask's edge in mind. */
export function editorStage(
  graph: Graph,
  element: HTMLElement,
  document: CanvasDocument,
  editor: Pick<Stage, "clear" | "project" | "emit">
): Stage {
  return {
    ...editor,
    document,
    show: (slide, animate) => flyToView(graph, element, fittingView(slide, element, 1), animate),
  };
}
