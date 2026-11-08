import { History } from "lucide-react";
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
  if (!undo.length && !redo.length) return null;
  return (
    <section className="saved-views history" aria-label="History">
      <h3>
        <History size={12} /> History
      </h3>
      <ul className="history-list">
        {redo
          .slice(0, SHOWN)
          .reverse()
          .map((label, index, all) => (
            <li key={`redo ${index}`} className="redo">
              <button
                className="saved-view-name"
                onClick={() => travelHistory(editor.document, "redo", all.length - index)}
              >
                {label}
              </button>
            </li>
          ))}
        {undo.slice(0, SHOWN).map((label, index) => (
          <li key={`undo ${index}`} className={index === 0 ? "current" : ""}>
            <button
              className="saved-view-name"
              aria-current={index === 0 ? "step" : undefined}
              title={index === 0 ? "Where the canvas is now" : "Return to just after this step"}
              onClick={() => travelHistory(editor.document, "undo", index)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
