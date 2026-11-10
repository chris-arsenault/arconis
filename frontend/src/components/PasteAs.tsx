import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { dismissPasteAs, pastePlainText } from "../editor/clipboard";
import { isOutline, outlineOf, type PasteForm } from "../editor/pasteAs";
import { isBox } from "../document/types";

/** Pasted lines wait here until the person says what they should become. */
export function PasteAs({ editor }: Readonly<{ editor: EditorController }>) {
  const pending = editor.ui.pasteAs;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissPasteAs(editor);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);
  if (!pending) return null;
  const lines = outlineOf(pending.text).length;
  const [selected] = editor.selected();
  const topic = selected && isBox(selected) ? selected : null;
  const choose = (form: PasteForm) => {
    pastePlainText(editor, pending.text, form, pending.at);
    dismissPasteAs(editor);
  };
  const treeLabel = topic ? `Branches under ${topic.name || "the selection"}` : "Topic tree";
  const suggested: PasteForm = isOutline(pending.text) || topic ? "tree" : "notes";
  const forms: { form: PasteForm; label: string; detail: string }[] = [
    {
      form: "notes",
      label: `${lines} notes`,
      detail: "Make a sticky note from each line, laid out in rows of four.",
    },
    {
      form: "tree",
      label: treeLabel,
      detail: topic
        ? "Add the lines as branches of the selected object, nested by their indentation."
        : "Build a topic tree headed by the first line, nested by indentation.",
    },
    {
      form: "text",
      label: "One text block",
      detail: "Keep all the lines together in a single text object.",
    },
  ];
  return (
    <div className="paste-as" role="dialog" aria-label="Paste as">
      <span>Paste {lines} lines as</span>
      {forms.map(({ form, label, detail }) => (
        <button
          key={form}
          ref={form === suggested ? first : undefined}
          className={form === suggested ? "primary" : ""}
          data-hint-detail={detail}
          onClick={() => choose(form)}
        >
          {label}
        </button>
      ))}
      <button
        className="icon-action"
        aria-label="Cancel paste"
        data-hint-detail="Drop the pasted lines without adding anything."
        onClick={() => dismissPasteAs(editor)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
