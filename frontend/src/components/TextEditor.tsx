import { useEffect, useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { hasSubtitle, hasText } from "../document/capabilities";
import { effectiveAppearance } from "../document/appearance";
import { changeSelectionLook } from "../editor/commands";
import { fitText } from "../editor/textLayout";
import { showTextEditor } from "../editor/ui";
import { ObjectText, SubtitleField } from "./TextContent";
import { TextProperties } from "./TextProperties";
import type { Item } from "../document/types";
import "./textEditor.css";

/** Full-size source and typography editing uses the same collaborative text as the canvas. */
export function TextEditor({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = (editor.ui.textEditor ?? [])
    .flatMap((id) => editor.document.get(id) ?? [])
    .filter(hasText);
  const [item] = selected;
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, []);
  useEffect(() => {
    if (!selected.length) showTextEditor(editor, null);
  }, [editor, selected.length]);
  if (!item) return null;
  return (
    <dialog
      ref={dialog}
      className="text-editor-dialog"
      aria-labelledby="text-editor-title"
      data-text-tools="true"
      onClose={() => showTextEditor(editor, null)}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
    >
      <header className="text-editor-heading">
        <div>
          <h2 id="text-editor-title">Edit text</h2>
          <p>Ctrl/⌘ Enter applies the current edit. Done returns to the canvas.</p>
        </div>
        <button
          className="icon-action"
          aria-label="Close text editor"
          data-hint-detail="Finish editing and return to the canvas. Changes are already saved."
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </header>
      <TextEditorFields editor={editor} selected={selected} />
      <footer className="text-editor-footer">
        <div className="text-editor-undo">
          <button
            data-hint-detail="Undo your last edit."
            onClick={() => editor.document.undo.undo()}
          >
            Undo
          </button>
          <button
            data-hint-detail="Redo your last undone edit."
            onClick={() => editor.document.undo.redo()}
          >
            Redo
          </button>
        </div>
        <button
          className="primary"
          data-hint-detail="Finish editing and return to the canvas."
          onClick={() => dialog.current?.close()}
        >
          Done
        </button>
      </footer>
    </dialog>
  );
}

function TextEditorFields({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const canvas = editor.document;
  const [item] = selected;
  return (
    <div className="text-editor-layout">
      <section className="text-editor-content" aria-label="Text content">
        {selected.length === 1 ? (
          <>
            {hasSubtitle(item) && (
              <div className="text-editor-subtitle">
                <span>Subtitle</span>
                <SubtitleField
                  value={item.subtitle}
                  actions={canvas.actions}
                  onChange={(subtitle) => canvas.patch(item.id, { subtitle })}
                />
              </div>
            )}
            <ObjectText editor={editor} item={item} />
          </>
        ) : (
          <p>
            Formatting applies to all {selected.length} selected objects. Select one object to edit
            its content.
          </p>
        )}
      </section>
      <section className="text-editor-format" aria-label="Text appearance">
        <TextProperties
          selected={selected}
          drawn={selected.map((target) =>
            effectiveAppearance(target, canvas.namedStyle(target.style))
          )}
          change={(look) => void changeSelectionLook(canvas, selected, look, true)}
          onFit={() => selected.forEach((target) => void fitText(canvas, target.id))}
        />
      </section>
    </div>
  );
}
