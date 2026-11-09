import type { SourceEdit } from "./commands";

const OBJECT_SCHEME = /^(?:canvas|local):/i;
const OBJECT_LINK = /^(?:canvas|local):\/\/([a-z_][a-z0-9_-]*)\/?$/i;

export function isCanvasObjectUrl(url: string) {
  return OBJECT_SCHEME.test(url);
}

/** Canvas ids are case-sensitive; do not parse them as URL hostnames. */
export function canvasObjectId(url: string) {
  return OBJECT_LINK.exec(url)?.[1] ?? null;
}

export function canvasObjectUrl(id: string) {
  return `canvas://${id}`;
}

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
