import { LanguageError } from "../language/lexer";
import type { CanvasTarget } from "./operations";

const imports = new WeakMap<CanvasTarget, string[]>();
const exports = new WeakMap<CanvasTarget, string>();

/** Session-local chunks keep portable images within the existing ALB/Lambda message limit. */
export async function importPortable(
  target: CanvasTarget,
  content: string,
  append: boolean,
  final: boolean
) {
  const chunks = append ? imports.get(target) : [];
  if (!chunks) throw new LanguageError("No import is in progress; start with append=false.");
  chunks.push(content);
  if (!final) {
    imports.set(target, chunks);
    return { staged: true, characters: chunks.reduce((total, chunk) => total + chunk.length, 0) };
  }
  imports.delete(target);
  return target.importDocument(chunks.join(""));
}

export async function exportPortable(
  target: CanvasTarget,
  items: string[],
  markup: boolean,
  offset: number
) {
  if (offset === 0) exports.set(target, await target.exportDocument(items, markup));
  const content = exports.get(target);
  if (content === undefined)
    throw new LanguageError("No export is in progress; start at offset=0.");
  if (offset > content.length)
    throw new LanguageError("Export offset exceeds the document length.");
  const end = Math.min(offset + 32_768, content.length);
  const next_offset = end < content.length ? end : null;
  if (next_offset === null) exports.delete(target);
  return {
    filename: "canvas.arconis",
    content: content.slice(offset, end),
    next_offset,
    total_characters: content.length,
  };
}
