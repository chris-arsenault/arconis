import { useRef, type RefObject } from "react";
import { Check, MessageSquare, MoreHorizontal, Shapes, Type } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { COLORS, isBox, type Item } from "../document/types";
import { changeSelectionLook, editSource } from "../editor/commands";
import { hasFill, hasLine, hasText } from "../document/capabilities";
import { effectiveAppearance, type Appearance } from "../document/appearance";
import { runCommand, showComments } from "../editor/registry";
import { openMenuOverSelection as openOverSelection } from "../editor/contextMenu";
import { MarkdownTools } from "./MarkdownTools";
import { useSelectionAnchor } from "./useSelectionAnchor";
import { CanvasObjectLink } from "./CanvasObjectLink";

/** Text sizes the toolbar steps through. */
const TEXT_SIZES = [10, 12, 14, 16, 18, 22, 28, 36, 48];

function FillSwatches({ editor, look }: Readonly<{ editor: EditorController; look: Appearance }>) {
  const mixed = !editor
    .selected()
    .filter(hasFill)
    .every(
      (item) => effectiveAppearance(item, editor.document.namedStyle(item.style)).fill === look.fill
    );
  return COLORS.map((color, index) => (
    <button
      key={color}
      className={`swatch swatch-${index}`}
      aria-label={`Fill ${color}`}
      aria-pressed={!mixed && look.fill === color}
      data-hint={`Fill ${["Yellow", "Rose", "Blue", "Green", "Purple", "White"][index]}`}
      data-hint-detail={`${color} · Applies to selected objects`}
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

function hidden(editor: EditorController, selected: Item[]) {
  return (
    !selected.length ||
    editor.ui.dragging ||
    editor.ui.menu !== null ||
    editor.ui.tagging ||
    Boolean(editor.ui.relating) ||
    Boolean(editor.ui.comments) ||
    selected.every((item) => item.locked)
  );
}

/**
 * One anchored surface changes content between object appearance and inline text editing.
 * Its position follows the selection through pan, zoom and changes of editing context.
 */
export function SelectionToolbar({
  editor,
  textarea,
}: Readonly<{ editor: EditorController; textarea: RefObject<HTMLTextAreaElement | null> }>) {
  const ref = useRef<HTMLDivElement>(null);
  useSelectionAnchor(editor, ref);
  const selected = editor.selected();
  if (hidden(editor, selected)) return null;
  const editing = editor.editId ? editor.document.get(editor.editId) : null;
  return (
    <div
      ref={ref}
      className={`contextual-tools${editing ? " inline-markdown-panel" : ""}`}
      role="region"
      aria-label="Object tools"
      data-text-tools={editing ? "true" : undefined}
    >
      {editing ? (
        <>
          <div className="contextual-tools-heading">
            <span>Text</span>
            <button
              type="button"
              aria-label="Finish editing text"
              data-hint="Finish editing (Esc)"
              onClick={() => {
                editor.closeEditor();
                editor.element.focus({ preventScroll: true });
              }}
            >
              <Check size={14} /> Done
            </button>
          </div>
          <MarkdownTools
            source={editing.name}
            appearance={effectiveAppearance(editing, editor.document.namedStyle(editing.style))}
            onEdit={(element, edit) => editSource(editor.document, editing.id, element, edit)}
            textarea={textarea}
            expanded
            compact
            objectLink={
              <CanvasObjectLink editor={editor} sourceId={editing.id} textarea={textarea} />
            }
          />
        </>
      ) : (
        <SelectionActions editor={editor} selected={selected} />
      )}
    </div>
  );
}

function SelectionActions({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const canvas = editor.document;
  const first = selected[0];
  const look = effectiveAppearance(first, canvas.namedStyle(first.style));
  const textItems = selected.filter(hasText);
  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selection toolbar"
      onMouseDown={(event) => {
        // Finish pending field edits after the command, so blur cannot move its target mid-click.
        if (event.button === 0 && event.target instanceof Element && event.target.closest("button"))
          event.preventDefault();
      }}
    >
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
          data-hint="Change shape"
          onClick={() => openOverSelection(editor, "ring.shape")}
        >
          <Shapes size={15} />
        </button>
      )}
      {selected.length === 1 && (
        <button
          aria-label="Comment"
          data-hint="Comment"
          onClick={() => showComments(editor, first.id)}
        >
          <MessageSquare size={15} />
        </button>
      )}
      <button
        aria-label="More commands"
        data-hint="More commands"
        onClick={() => openOverSelection(editor, null)}
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
  );
}
