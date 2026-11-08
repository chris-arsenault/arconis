import type { EditorController } from "./controller";
import { objectStyle, resolvedLook } from "./styles";
import { renderMarkdown } from "../text/markdown";
import type { Item } from "../document/types";

/** Captions and container titles cannot resize their pictures, vendor icons, slides or frames. */
export function textCanResize(item: Item) {
  return (
    ["text", "note", "card"].includes(item.type) ||
    (item.type === "node" && item.stencil !== "icon" && item.stencil !== "junction")
  );
}

/** Measure only the label being authored, in comfortable CSS pixels even at deep canvas scales. */
export async function fitText(editor: EditorController, id: string, growingOnly = false) {
  await document.fonts.ready;
  const item = editor.document.get(id);
  if (!item || !textCanResize(item)) return;
  const named = editor.document.namedStyle(item.style);
  const look = resolvedLook(item, named);
  if (growingOnly && look.textFit !== "height") return;
  const scale = look.scale ?? 1;
  const height = measureHeight(item, objectStyle(item, named) as Record<string, unknown>, scale);
  if (Number.isFinite(height) && height > 0 && item.height !== height)
    editor.document.patch(id, { height });
}

function measureHeight(item: Item, style: Record<string, unknown>, scale: number) {
  const padding = Number(style.spacing ?? 14) / scale;
  const size = Number(style.fontSize ?? 14) / scale;
  const measure = document.createElement("div");
  measure.className = "canvas-markdown";
  const flags = Number(style.fontStyle ?? 0);
  Object.assign(measure.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    width: `${Math.max(size, item.width / scale - padding * 2)}px`,
    fontSize: `${size}px`,
    fontFamily: String(style.fontFamily),
    fontWeight: flags & 1 ? "700" : "400",
    fontStyle: flags & 2 ? "italic" : "normal",
    lineHeight: String(style.labelLineHeight ?? 1.35),
  });
  measure.style.setProperty("--text-paragraph-gap", `${Number(style.labelParagraphGap ?? 0.5)}em`);
  measure.innerHTML = renderMarkdown(item.name);
  document.body.append(measure);
  const contentHeight = measure.getBoundingClientRect().height;
  measure.remove();
  return Math.ceil((Math.max(size * 1.35, contentHeight) + padding * 2) * scale * 1e6) / 1e6;
}
