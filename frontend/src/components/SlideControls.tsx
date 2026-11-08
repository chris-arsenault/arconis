import { Play } from "lucide-react";
import { deckOf, isSlide, isTemplate, SLIDE_SIZES } from "../document/slides";
import type { Item } from "../document/types";
import { Section } from "./ConnectionControls";
import { useCompletedField } from "./useCompletedField";
import type { CompletedActions } from "../document/actions";

/** Makes the slide its deck's template, number 0, or gives it back a number at the deck's end. */
function TemplateToggle({
  item,
  onTemplate,
}: Readonly<{ item: Item; onTemplate: (template: boolean) => void }>) {
  return (
    <label className="slide-template" title="Number 0: drawn under every slide of the deck">
      <input
        type="checkbox"
        checked={isTemplate(item)}
        onChange={(event) => onTemplate(event.target.checked)}
      />
      {"Template under the deck's slides"}
    </label>
  );
}

/** A slide's deck, its number in the deck, whether it is the deck's template, and its proportions. */
export function SlideControls({
  item,
  names,
  actions,
  onDeck,
  onNumber,
  onTemplate,
  onSize,
  onPresent,
}: Readonly<{
  item: Item;
  names: string[];
  actions: Pick<CompletedActions, "begin">;
  onDeck: (deck: string) => void;
  onNumber: (number: number) => void;
  onTemplate: (template: boolean) => void;
  onSize: (width: number, height: number) => void;
  onPresent: () => void;
}>) {
  const deckEdit = useCompletedField(actions);
  if (!isSlide(item)) return null;
  return (
    <Section title="Slide">
      <div className="slide-fields">
        <label className="slide-field">
          <span>Deck</span>
          <input
            aria-label="Deck"
            list="deck-names"
            value={deckOf(item)}
            onChange={(event) => {
              deckEdit.start();
              onDeck(event.target.value);
            }}
            onBlur={deckEdit.finish}
            onKeyDown={deckEdit.keydown}
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
              if (event.target.value !== "") onNumber(Number(event.target.value));
            }}
          />
        </label>
      </div>
      <TemplateToggle item={item} onTemplate={onTemplate} />
      <SlideSize item={item} onSize={onSize} />
      <button className="text-action" onClick={onPresent}>
        <Play size={14} /> Present from here
      </button>
    </Section>
  );
}

function SlideSize({
  item,
  onSize,
}: Readonly<{ item: Item; onSize: (width: number, height: number) => void }>) {
  const size = SLIDE_SIZES.find(
    (candidate) => candidate.width === item.width && candidate.height === item.height
  );
  return (
    <select
      aria-label="Slide size"
      value={size?.name ?? ""}
      onChange={(event) => {
        const chosen = SLIDE_SIZES.find((candidate) => candidate.name === event.target.value);
        if (chosen) onSize(chosen.width, chosen.height);
      }}
    >
      <option value="">Custom</option>
      {SLIDE_SIZES.map((candidate) => (
        <option key={candidate.name} value={candidate.name}>
          {candidate.name} ({candidate.width} × {candidate.height})
        </option>
      ))}
    </select>
  );
}
