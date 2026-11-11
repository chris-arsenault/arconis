import { useCallback, useEffect, useRef } from "react";
import { Presentation, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import {
  chooseDeckExport,
  closeDeckChooser,
  exportableDecks,
  exportDeck,
  preferredDeck,
} from "../editor/deckExport";
import { presentedSlides } from "../document/slides";

/**
 * The File menu's deck export, with the other exports. It is always listed, and unavailable until
 * the room has a slide. A deck never carries markup, whatever the menu's markup choice.
 */
export function DeckExportItem({
  editor,
  run,
}: Readonly<{ editor: EditorController | null; run: (action: () => void) => () => void }>) {
  const ready = editor !== null && exportableDecks(editor.document.list()).length > 0;
  return (
    <button
      role="menuitem"
      aria-disabled={!ready}
      onClick={ready ? run(() => chooseDeckExport(editor)) : undefined}
      data-hint="Export deck as HTML"
      data-hint-detail="Download a deck's slides as one file that opens in any browser, without markup or speaker notes. It needs a slide to export."
    >
      <Presentation size={15} /> Export deck as HTML
    </button>
  );
}

/** Keeps the keyboard inside the dialog, closes it on Escape and returns focus when it goes. */
function useDialogKeys(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const buttons = () => [...(ref.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    (ref.current?.querySelector<HTMLElement>(".primary") ?? buttons()[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const all = buttons();
      const index = all.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      all[(index + (event.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [ref, close]);
}

/** Asks which of the room's decks to export, starting on the selected slide's. */
export function DeckChooser({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLElement>(null);
  const close = useCallback(() => closeDeckChooser(editor), [editor]);
  useDialogKeys(ref, close);
  const items = editor.document.list();
  const names = exportableDecks(items);
  const preferred = preferredDeck(items, editor.selected());
  // The decks went while the dialog was open, so there is nothing left to choose.
  useEffect(() => {
    if (!names.length) close();
  }, [names.length, close]);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-chooser-title"
      >
        <button
          className="close-dialog icon-button"
          aria-label="Close dialog"
          data-hint-detail="Close this dialog without exporting a deck."
          onClick={close}
        >
          <X size={18} />
        </button>
        <h2 id="deck-chooser-title">Export which deck?</h2>
        <ul className="deck-choices">
          {names.map((deck) => (
            <li key={deck}>
              <button
                className={deck === preferred ? "primary" : ""}
                data-hint-detail="Download this deck's slides as one file that opens in any browser."
                onClick={() => {
                  close();
                  void exportDeck(editor, deck);
                }}
              >
                <span>{deck}</span>
                <span>{slideCount(presentedSlides(items, deck).length)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const slideCount = (count: number) => (count === 1 ? "1 slide" : `${count} slides`);
