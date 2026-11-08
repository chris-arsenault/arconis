import { useEffect, useRef, useState } from "react";
import { Network, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { captureNote, captureToTree } from "../editor/capture";
import { endCapture } from "../editor/registry";

/**
 * Capture: type an idea, press Enter, and it lands as a note under the last one; the stack can
 * become a tree in one click. Escape or the close button ends capture.
 */
export function CaptureBox({ editor }: Readonly<{ editor: EditorController }>) {
  const capture = editor.ui.capture;
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => input.current?.focus(), []);
  if (!capture) return null;
  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    capture.ids.push(captureNote(editor.document, capture, trimmed, editor.graph.view.scale));
    setText("");
    editor.emit();
  };
  const count = capture.ids.length;
  return (
    <div className="capture-box" role="dialog" aria-label="Capture notes">
      <textarea
        ref={input}
        aria-label="Captured note"
        placeholder="Type an idea, Enter adds it"
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            add();
          } else if (event.key === "Escape") endCapture(editor);
        }}
      />
      <div className="capture-actions">
        <span className="capture-count">
          {count} {count === 1 ? "note" : "notes"}
        </span>
        <button
          className="text-action"
          disabled={count < 2}
          onClick={() => {
            const root = captureToTree(editor.document, capture.ids);
            endCapture(editor);
            if (root) editor.select(root);
          }}
        >
          <Network size={14} /> Make a tree
        </button>
        <button
          className="icon-action"
          aria-label="Stop capturing"
          onClick={() => endCapture(editor)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
