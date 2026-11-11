import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { dismissPasteAs, pasteForeign, pastePlainText } from "../editor/clipboard";
import { FORMAT_NAMES, foreignFormat } from "../interchange";
import { isOutline, outlineOf, type PasteForm } from "../editor/pasteAs";
import { isBox } from "../document/types";

interface Choice {
  key: string;
  label: string;
  detail: string;
  run: () => void;
}

type Pending = NonNullable<EditorController["ui"]["pasteAs"]>;

/** The diagram or outline another tool wrote, offered as the objects it describes. */
function foreignChoice(editor: EditorController, pending: Pending): Choice[] {
  const format = foreignFormat(pending.text);
  const room = editor.room;
  if (!format || !room) return [];
  const run = () => {
    dismissPasteAs(editor);
    pasteForeign(editor, room, pending.text, format, pending.at).catch((error: unknown) =>
      room.setNotice(error instanceof Error ? error.message : "That could not be pasted.")
    );
  };
  return [
    {
      key: "foreign",
      label: FORMAT_NAMES[format],
      detail: "Turn the diagram or outline into objects you can edit here.",
      run,
    },
  ];
}

/** What the pasted text can become, and which choice to offer first. */
function pasteChoices(editor: EditorController, pending: Pending) {
  const lines = outlineOf(pending.text).length;
  const [selected] = editor.selected();
  const topic = selected && isBox(selected) ? selected : null;
  const plain = (form: PasteForm) => () => {
    pastePlainText(editor, pending.text, form, pending.at);
    dismissPasteAs(editor);
  };
  const foreign = foreignChoice(editor, pending);
  const choices: Choice[] = [
    ...foreign,
    {
      key: "notes",
      label: `${lines} notes`,
      detail: "Make a sticky note from each line, laid out in rows of four.",
      run: plain("notes"),
    },
    {
      key: "tree",
      label: topic ? `Branches under ${topic.name || "the selection"}` : "Topic tree",
      detail: topic
        ? "Add the lines as branches of the selected object, nested by their indentation."
        : "Build a topic tree headed by the first line, nested by indentation.",
      run: plain("tree"),
    },
    {
      key: "text",
      label: "One text block",
      detail: "Keep all the lines together in a single text object.",
      run: plain("text"),
    },
  ];
  const plainSuggestion = isOutline(pending.text) || topic !== null ? "tree" : "notes";
  const suggested = foreign.length ? "foreign" : plainSuggestion;
  return { lines, choices, suggested };
}

function useEscape(dismiss: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);
}

/**
 * Pasted lines wait here until the person says what they should become. Text written for another
 * diagram or outline tool is offered first as the objects it describes.
 */
export function PasteAs({ editor }: Readonly<{ editor: EditorController }>) {
  const pending = editor.ui.pasteAs;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEscape(() => dismissPasteAs(editor));
  if (!pending) return null;
  const { lines, choices, suggested } = pasteChoices(editor, pending);
  return (
    <div className="paste-as" role="dialog" aria-label="Paste as">
      <span>Paste {lines === 1 ? "this" : `${lines} lines`} as</span>
      {choices.map(({ key, label, detail, run }) => (
        <button
          key={key}
          ref={key === suggested ? first : undefined}
          className={key === suggested ? "primary" : ""}
          data-hint-detail={detail}
          onClick={run}
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
