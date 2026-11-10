import type { EditorController } from "../editor/controller";
import { historyEntries, travelHistory } from "../editor/history";

/** How many steps the panel lists each way. */
const SHOWN = 12;

/**
 * This person's undo history as a list: each step by what it did, newest first. Clicking a step
 * returns the canvas to just after it; clicking a redo step goes forward to it.
 */
export function HistoryPanel({ editor }: Readonly<{ editor: EditorController }>) {
  const { undo, redo } = historyEntries(editor.document);
  return (
    <ul className="history-list rail-list">
      {redo
        .slice(0, SHOWN)
        .reverse()
        .map((label, index, all) => (
          <li key={`redo ${index}`} className="redo">
            <button
              className="rail-entry"
              data-hint="Go forward to just after this step"
              data-hint-detail="Redo your undone changes up to and including this one."
              onClick={() => travelHistory(editor.document, "redo", all.length - index)}
            >
              {label}
            </button>
          </li>
        ))}
      {undo.slice(0, SHOWN).map((label, index) => (
        <li key={`undo ${index}`} className={index === 0 ? "current" : ""}>
          <button
            className="rail-entry"
            aria-current={index === 0 ? "step" : undefined}
            data-hint={index === 0 ? "Where the canvas is now" : "Return to just after this step"}
            data-hint-detail="Undo your changes made after this step; other people's changes stay."
            onClick={() => travelHistory(editor.document, "undo", index)}
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
}
