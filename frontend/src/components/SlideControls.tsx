import { Play } from "lucide-react";
import { useId, useRef, useState } from "react";
import { deckOf, isSlide, isTemplate, SLIDE_SIZES } from "../document/slides";
import type { Item } from "../document/types";
import { Section } from "./ConnectionControls";
import type { CompletedActions } from "../document/actions";
import { NumericInput } from "./NumericInput";

/** Makes the slide its deck's template, number 0, or gives it back a number at the deck's end. */
function TemplateToggle({
  item,
  onTemplate,
}: Readonly<{ item: Item; onTemplate: (template: boolean) => void }>) {
  return (
    <label
      className="slide-template"
      data-hint="Deck template"
      data-hint-detail="Make this slide number 0, drawn beneath every other slide of its deck."
    >
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
  const deckId = useId();
  const numberId = useId();
  if (!isSlide(item)) return null;
  return (
    <Section title="Slide">
      <div className="slide-fields">
        <label
          className="slide-field"
          htmlFor={deckId}
          data-hint-detail="Name the deck this slide belongs to; slides sharing a name present together."
        >
          <span>Deck</span>
          <DeckInput
            id={deckId}
            key={item.id}
            value={deckOf(item)}
            actions={actions}
            onCommit={onDeck}
          />
        </label>
        <datalist id="deck-names">
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label
          className="slide-field slide-number"
          htmlFor={numberId}
          data-hint-detail="Set where this slide comes in its deck's presenting order."
        >
          <span>No.</span>
          <NumericInput
            id={numberId}
            key={item.id}
            label="Slide number"
            value={item.slide ?? 0}
            minimum={0}
            integer
            onCommit={onNumber}
          />
        </label>
      </div>
      <TemplateToggle item={item} onTemplate={onTemplate} />
      <SlideSize item={item} onSize={onSize} />
      <button
        className="text-action"
        data-hint-detail="Present this slide's deck, starting with this slide."
        onClick={onPresent}
      >
        <Play size={14} /> Present from here
      </button>
    </Section>
  );
}

function DeckInput({
  id,
  value,
  actions,
  onCommit,
}: Readonly<{
  id: string;
  value: string;
  actions: Pick<CompletedActions, "begin">;
  onCommit: (deck: string) => void;
}>) {
  const [draft, setDraft] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const commit = () => {
    const next = draft?.trim() || "deck";
    if (draft !== null && next !== value) {
      const finish = actions.begin();
      onCommit(next);
      finish();
    }
    setDraft(null);
  };
  return (
    <input
      id={id}
      aria-label="Deck"
      list="deck-names"
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!skipBlur.current) commit();
        skipBlur.current = false;
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Enter") commit();
        else setDraft(null);
        skipBlur.current = true;
        event.currentTarget.blur();
      }}
    />
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
      data-hint-detail="Resize this slide to a standard screen proportion."
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
