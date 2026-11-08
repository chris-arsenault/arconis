import { Play } from "lucide-react";
import {
  deckOf,
  decks,
  isSlide,
  isTemplate,
  nextSlideNumber,
  SLIDE_SIZES,
  TEMPLATE_NUMBER,
} from "../document/slides";
import type { Item } from "../document/types";
import type { EditorController } from "../editor/controller";
import { Section } from "./ConnectionControls";

/** Makes the slide its deck's template, number 0, or gives it back a number at the deck's end. */
function TemplateToggle({ editor, item }: Readonly<{ editor: EditorController; item: Item }>) {
  const setTemplate = (template: boolean) =>
    editor.document.patch(item.id, {
      slide: template ? TEMPLATE_NUMBER : nextSlideNumber(editor.document.list(), deckOf(item)),
    });
  return (
    <label className="slide-template" title="Number 0: drawn under every slide of the deck">
      <input
        type="checkbox"
        checked={isTemplate(item)}
        onChange={(event) => setTemplate(event.target.checked)}
      />
      {"Template under the deck's slides"}
    </label>
  );
}

/** A slide's deck, its number in the deck, whether it is the deck's template, and its proportions. */
export function SlideControls({
  editor,
  item,
}: Readonly<{ editor: EditorController; item: Item }>) {
  if (!isSlide(item)) return null;
  const names = decks(editor.document.list()).map((deck) => deck.deck);
  const size = SLIDE_SIZES.find(
    (candidate) => candidate.width === item.width && candidate.height === item.height
  );
  return (
    <Section title="Slide">
      <div className="slide-fields">
        <label className="slide-field">
          <span>Deck</span>
          <input
            aria-label="Deck"
            list="deck-names"
            value={deckOf(item)}
            onChange={(event) =>
              editor.document.patch(item.id, { deck: event.target.value || undefined })
            }
          />
        </label>
        <datalist id="deck-names">
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label className="slide-field slide-number">
          <span>No.</span>
          <input
            type="number"
            aria-label="Slide number"
            value={item.slide ?? 0}
            onChange={(event) => {
              if (event.target.value !== "")
                editor.document.patch(item.id, { slide: Number(event.target.value) });
            }}
          />
        </label>
      </div>
      <TemplateToggle editor={editor} item={item} />
      <select
        aria-label="Slide size"
        value={size?.name ?? ""}
        onChange={(event) => {
          const chosen = SLIDE_SIZES.find((candidate) => candidate.name === event.target.value);
          if (chosen)
            editor.updateGeometry(item.id, { width: chosen.width, height: chosen.height });
        }}
      >
        <option value="">Custom</option>
        {SLIDE_SIZES.map((candidate) => (
          <option key={candidate.name} value={candidate.name}>
            {candidate.name} ({candidate.width} × {candidate.height})
          </option>
        ))}
      </select>
      <button className="text-action" onClick={() => editor.presenter.start(deckOf(item), item.id)}>
        <Play size={14} /> Present from here
      </button>
    </Section>
  );
}
