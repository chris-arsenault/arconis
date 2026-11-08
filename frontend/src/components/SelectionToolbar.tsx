import { MessageSquare, MoreHorizontal, Shapes, Type } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { COLORS, isBox, type Item } from "../document/types";
import { changeSelectionLook } from "../editor/commands";
import { hasFill, hasLine, hasText } from "../document/capabilities";
import { effectiveAppearance, type Appearance } from "../document/appearance";
import { worldBounds } from "../document/relations";
import { openMenu, openSubRing, runCommand, showComments } from "../editor/registry";

/** Text sizes the toolbar steps through. */
const TEXT_SIZES = [10, 12, 14, 16, 18, 22, 28, 36, 48];

function FillSwatches({ editor, look }: Readonly<{ editor: EditorController; look: Appearance }>) {
  return COLORS.map((color, index) => (
    <button
      key={color}
      className={`swatch swatch-${index}`}
      aria-label={`Fill ${color}`}
      aria-pressed={look.fill === color}
      onClick={() => runCommand(editor, `colour.${index}`)}
    />
  ));
}

function TextSizeButtons({
  editor,
  items,
  look,
}: Readonly<{ editor: EditorController; items: Item[]; look: Appearance }>) {
  const step = (by: number) => {
    const index = TEXT_SIZES.findIndex((size) => size >= look.textSize);
    const at = (index < 0 ? 2 : index) + by;
    const next = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, at))];
    changeSelectionLook(editor.document, items, { textSize: next }, true);
  };
  return (
    <span className="toolbar-group" aria-label="Text size">
      <button aria-label="Smaller text" onClick={() => step(-1)}>
        <Type size={11} />
      </button>
      <button aria-label="Larger text" onClick={() => step(1)}>
        <Type size={16} />
      </button>
    </span>
  );
}

/** Opens the ring and menu over the selection, straight into a sub-ring when asked. */
function openOverSelection(editor: EditorController, subRing: string | null) {
  const bounds = worldBounds(editor.selected());
  if (!bounds) return;
  const { scale, translate } = editor.graph.view;
  const world = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const at = { x: (world.x + translate.x) * scale, y: (world.y + translate.y) * scale };
  openMenu(editor, { at, world, wedge: null, subRing: null });
  if (subRing) openSubRing(editor, subRing);
}

function hidden(editor: EditorController, selected: Item[]) {
  return (
    !selected.length ||
    editor.ui.dragging ||
    Boolean(editor.editId) ||
    editor.ui.menu !== null ||
    selected.every((item) => item.locked)
  );
}

/**
 * The toolbar for the selection: fill, line colour, text size, shape, comment and the rest of
 * the menu. It keeps one place above the view controls, so it never covers the selection, its
 * handles or a neighbour; the ring and menu are the near-pointer way to the same commands.
 * It hides while the selection is being dragged and while typing.
 */
export function SelectionToolbar({ editor }: Readonly<{ editor: EditorController }>) {
  const selected = editor.selected();
  if (hidden(editor, selected)) return null;
  const canvas = editor.document;
  const first = selected[0];
  const look = effectiveAppearance(first, canvas.namedStyle(first.style));
  const textItems = selected.filter(hasText);
  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Selection toolbar">
      {selected.some(hasFill) && <FillSwatches editor={editor} look={look} />}
      {selected.some(hasLine) && (
        <input
          className="color-chip"
          type="color"
          aria-label="Line color"
          value={/^#[0-9a-f]{6}$/i.test(look.line) ? look.line : "#9ca5b8"}
          onChange={(event) => changeSelectionLook(canvas, selected, { line: event.target.value })}
        />
      )}
      {textItems.length > 0 && <TextSizeButtons editor={editor} items={textItems} look={look} />}
      {selected.some((item) => isBox(item) && item.type !== "frame") && (
        <button
          aria-label="Change shape"
          title="Change shape"
          onClick={() => openOverSelection(editor, "ring.shape")}
        >
          <Shapes size={15} />
        </button>
      )}
      {selected.length === 1 && (
        <button aria-label="Comment" title="Comment" onClick={() => showComments(editor, first.id)}>
          <MessageSquare size={15} />
        </button>
      )}
      <button
        aria-label="More commands"
        title="More"
        onClick={() => openOverSelection(editor, null)}
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
  );
}
