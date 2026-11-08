import { isWebLink } from "../language/fields";
import type { EditorController } from "./controller";
import { goToSlide, jumpTo } from "./topics";
import { flyToView } from "./views";

/**
 * Follows an item's link: a web address opens in a new tab, and the id of an item, slide or saved
 * view flies there.
 */
export function followLink(editor: EditorController, link: string) {
  if (isWebLink(link)) {
    if (/^https?:/i.test(link)) window.open(link, "_blank", "noopener,noreferrer");
    return;
  }
  const view = editor.document.views.get(link);
  if (view) {
    flyToView(editor.graph, editor.element, view);
    return;
  }
  const item = editor.document.get(link);
  if (!item) return;
  if (item.type === "slide") goToSlide(editor, item.id);
  else jumpTo(editor, item.id);
}
