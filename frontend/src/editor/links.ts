import { isWebLink } from "../language/fields";
import type { EditorController } from "./controller";
import { goToSlide, jumpTo } from "./topics";
import { flyToView } from "./views";
import { canvasObjectId, isCanvasObjectUrl } from "../text/objectLinks";

/**
 * Follows an item's link: a web address opens in a new tab, and the id of an item, slide or saved
 * view flies there.
 */
export function followLink(editor: EditorController, link: string) {
  if (isCanvasObjectUrl(link)) {
    const id = canvasObjectId(link);
    if (!id) editor.room?.setNotice("Invalid object link. Use canvas:// followed by an object id.");
    else if (!editor.document.get(id))
      editor.room?.setNotice("The linked object no longer exists in this canvas.");
    else {
      editor.room?.setNotice("");
      followObject(editor, id);
    }
    return;
  }
  if (isWebLink(link)) {
    if (/^https?:/i.test(link)) window.open(link, "_blank", "noopener,noreferrer");
    return;
  }
  const view = editor.document.views.get(link);
  if (view) {
    flyToView(editor.graph, editor.element, view);
    return;
  }
  followObject(editor, link);
}

function followObject(editor: EditorController, id: string) {
  const item = editor.document.get(id);
  if (!item) return;
  if (item.type === "slide") goToSlide(editor, item.id);
  else jumpTo(editor, item.id);
}

function localAnchor(target: EventTarget | null) {
  const anchor =
    target instanceof Element
      ? target.closest<HTMLAnchorElement>(".canvas-markdown a[href]")
      : null;
  return anchor && isCanvasObjectUrl(anchor.getAttribute("href") ?? "") ? anchor : null;
}

/** Local Markdown links navigate in this room, including links in the source preview. */
export function bindMarkdownLinks(editor: EditorController, signal: AbortSignal) {
  const area = editor.element.closest(".workspace") ?? editor.element;
  const options = { signal, capture: true };
  const press = (event: Event) => {
    if (
      editor.tool !== "pan" &&
      event instanceof MouseEvent &&
      event.button === 0 &&
      localAnchor(event.target)
    )
      event.stopPropagation();
  };
  area.addEventListener("pointerdown", press, options);
  area.addEventListener("mousedown", press, options);
  area.addEventListener(
    "click",
    (event) => {
      const anchor = localAnchor(event.target);
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      if (editor.tool === "pan") return;
      const href = anchor.getAttribute("href")!;
      editor.closeEditor();
      followLink(editor, href);
      editor.element.focus({ preventScroll: true });
    },
    options
  );
}
