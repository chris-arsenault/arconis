import { Play, Plus } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { Item } from "../document/types";
import { decks, isTemplate, type Deck } from "../document/slides";
import { goToSlide } from "../editor/topics";
import { PanelHeading } from "./RailSection";

/** The room's decks: add a slide, go to one, or present a deck. */
export function SlidesPanel({ editor }: Readonly<{ editor: EditorController }>) {
  const all = decks(editor.document.list());
  return (
    <section aria-label="Slide decks">
      <PanelHeading title="Slides and presenting">
        Frame parts of the canvas and present them in order.
      </PanelHeading>
      <div className="rail-panel-actions">
        <button
          aria-pressed={editor.tool === "slide"}
          data-hint-detail="Then click the canvas to place a slide frame where you want it."
          onClick={() => editor.setTool("slide")}
        >
          <Plus size={16} /> Add slide
        </button>
        <p className="rail-description">
          {editor.tool === "slide"
            ? "Click the canvas to place a slide."
            : "Select a slide to set its deck, size and speaker notes."}
        </p>
      </div>
      {all.length ? (
        <Decks
          all={all}
          onPresent={(deck) => editor.presenter.start(deck)}
          onGo={(id) => goToSlide(editor, id)}
        />
      ) : (
        <p className="rail-empty">
          No slides yet. Add a slide around the content you want to present.
        </p>
      )}
    </section>
  );
}

/** A slide's line in the panel: its number, or Template, then its name. */
function slideEntry(slide: Item) {
  if (isTemplate(slide)) return slide.name ? `Template · ${slide.name}` : "Template";
  return `${slide.slide ?? 0} · ${slide.name || "Slide"}`;
}

/** Every deck in the room with its slides in order; clicking a slide flies to it. */
function Decks({
  all,
  onPresent,
  onGo,
}: Readonly<{ all: Deck[]; onPresent: (deck: string) => void; onGo: (id: string) => void }>) {
  return (
    <div className="rail-list">
      {all.map(({ deck, slides }) => (
        <div className="deck" key={deck} data-testid="deck">
          <div className="deck-title">
            <span>{deck}</span>
            <button
              className="rail-action deck-present"
              data-hint={`Present ${deck}`}
              aria-label={`Present ${deck}`}
              data-hint-detail="Show this deck slide by slide with the editing tools hidden."
              onClick={() => onPresent(deck)}
            >
              <Play size={13} /> Present
            </button>
          </div>
          {slides.map((slide) => (
            <button
              key={slide.id}
              className="rail-entry"
              data-hint-detail="Select this slide and move your view to it."
              onClick={() => onGo(slide.id)}
            >
              {slideEntry(slide)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
