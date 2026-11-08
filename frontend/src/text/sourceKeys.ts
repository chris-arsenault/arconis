import type { KeyboardEvent } from "react";
import type { CanvasDocument } from "../document/canvasDocument";
import { applySourceEdit, sourceAction, structuralKey, type TextAction } from "./commands";

const SHORTCUTS: Record<string, TextAction> = { b: "bold", i: "italic", u: "underline", k: "link" };

export function markdownKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  document: CanvasDocument,
  id: string
) {
  if (event.nativeEvent.isComposing || event.altKey) return false;
  const element = event.currentTarget;
  const { value, selectionStart, selectionEnd } = element;
  const modifier = event.ctrlKey || event.metaKey;
  const action =
    event.shiftKey && event.key.toLowerCase() === "x"
      ? "strike"
      : SHORTCUTS[event.key.toLowerCase()];
  const edit =
    modifier && action
      ? sourceAction(value, selectionStart, selectionEnd, action)
      : !modifier && structuralKey(value, selectionStart, selectionEnd, event.key, event.shiftKey);
  if (!edit) return false;
  event.preventDefault();
  event.stopPropagation();
  applySourceEdit(document, id, element, edit);
  return true;
}
