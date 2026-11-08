import { useEffect, useState } from "react";
import type { EditorController } from "../editor/controller";
import { typeLabel } from "../document/types";

/** What a screen reader hears: the selection as it changes, and the tool in hand. */
function describe(editor: EditorController) {
  const selected = editor.selected();
  const tool = editor.tool === "select" ? "" : `${editor.tool} tool`;
  if (selected.length > 1) return `${selected.length} objects selected. ${tool}`.trim();
  if (selected.length === 1) {
    const [item] = selected;
    const name = item.name.split("\n")[0];
    const what = name ? `${typeLabel(item)} ${name}` : typeLabel(item);
    return `${what} selected. ${tool}`.trim();
  }
  return tool || "Nothing selected";
}

/** A polite live region, so assistive technology follows selection and tool changes. */
export function Announcer({ editor }: Readonly<{ editor: EditorController }>) {
  const [message, setMessage] = useState("");
  const current = describe(editor);
  useEffect(() => {
    const timer = setTimeout(() => setMessage(current), 150);
    return () => clearTimeout(timer);
  }, [current]);
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="announcer">
      {message}
    </div>
  );
}
