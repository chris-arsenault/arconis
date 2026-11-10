import type { SourceEdit } from "./commands";
import { canvasObjectUrl } from "../document/ids";

/** Wrap the selected Markdown, or insert a readable label when the caret has no selection. */
export function objectLinkEdit(
  source: string,
  start: number,
  end: number,
  id: string,
  name: string
): SourceEdit {
  const selected = source.slice(start, end);
  const label = selected || name.replaceAll(/([\\[\]])/g, "\\$1").replaceAll(/\s+/g, " ");
  const text = `[${label}](${canvasObjectUrl(id)})`;
  const caret = start + text.length;
  return { start, end, text, anchor: caret, head: caret };
}
