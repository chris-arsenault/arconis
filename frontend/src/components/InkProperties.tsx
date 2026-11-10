import type { EditorController } from "../editor/controller";
import type { Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { isMarkup } from "../document/ink";

import { selectedInkSettings } from "../editor/inkStyle";
import { BrushControls } from "./BrushControls";
import "./drawing.css";

/** Sampling a colour into a swatch belongs to the Draw brush, not to ink already drawn. */
const noop = () => {};
type Props = Readonly<{ editor: EditorController; ink: Item[] }>;

/**
 * Selected ink's paint, with the same controls as the brush that made it. Edits apply at once,
 * are shared and undoable, and leave the Draw brush and Markup's choices as they were.
 */
export function InkPaint({ editor, ink }: Props) {
  const { document, drawing } = editor;
  const closed = ink.some(
    (item) => effectiveAppearance(item, document.namedStyle(item.style)).closed
  );
  return (
    <div className="drawing-tools ink-properties">
      {ink.length > 1 && (
        <p className="drawing-hint">
          Controls show the first path. Edits apply to all selected paths.
        </p>
      )}
      <BrushControls
        settings={selectedInkSettings(document, ink[0])}
        change={(settings) => drawing.style(settings)}
        recent={drawing.recent}
        selected
        closed={closed}
        onTarget={noop}
        onClose={() => drawing.close()}
      />
    </div>
  );
}

/** Keeping an annotation as canvas content, or lifting content ink out into markup. */
export function InkMoves({ editor, ink }: Props) {
  const promote = ink.some(isMarkup);
  const demote = ink.some((item) => !isMarkup(item));
  const layer = editor.document.layerList().find(({ id }) => id === editor.layers.active);
  return (
    <section className="inspector-primary ink-moves" aria-label="Ink">
      {promote && (
        <button
          data-hint={`Move to content layer: ${layer?.name ?? ""}`}
          data-hint-detail="Keep the selected annotations as content of the active layer."
          onClick={() => editor.drawing.transfer(false)}
        >
          Move to content layer
        </button>
      )}
      {demote && (
        <button
          data-hint-detail="Lift the selected ink out of its layer into markup above all content."
          onClick={() => editor.drawing.transfer(true)}
        >
          Move to Markup
        </button>
      )}
    </section>
  );
}
