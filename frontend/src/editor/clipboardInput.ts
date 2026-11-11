import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "./controller";
import {
  clipboardText,
  copySelection,
  cutSelection,
  looksLikeLanguage,
  pasteLanguage,
  pastePlainText,
  pastePoint,
  type PastePlace,
} from "./clipboard";
import { placePictureFile } from "./pictureInput";
import { LanguageError } from "../language/lexer";
import { isInputTarget } from "./ui";
import { foreignFormat } from "../interchange";

/** A paste in place is asked for by its key just before the browser's paste event arrives. */
const IN_PLACE_WINDOW_MS = 1000;
/** How long after a middle press a paste event is the platform's selection paste, not a person's. */
const MIDDLE_CLICK_WINDOW_MS = 500;

/** Nothing can be pasted until the room key has opened its storage. */
function isLocked(session: RoomSession) {
  return session.lock.state !== "unlocked";
}

function firstImage(files: Iterable<File> | ArrayLike<File> | undefined) {
  return Array.from(files ?? []).find((file) => file.type.startsWith("image/"));
}

/**
 * Pastes whatever text arrived: canvas language becomes objects, one line becomes a text block,
 * and several lines, or a diagram written for another tool, ask how they should be pasted.
 */
export async function pasteText(
  editor: EditorController,
  session: RoomSession,
  text: string,
  place: PastePlace
) {
  if (!text.trim()) return;
  if (looksLikeLanguage(text)) {
    try {
      await pasteLanguage(editor, session, text, place);
      return;
    } catch (error) {
      // Language that names items this canvas lacks pastes as the text it is.
      if (!(error instanceof LanguageError)) throw error;
    }
  }
  const at = "at" in place ? place.at : pastePoint(editor);
  // Several lines, or another tool's diagram even on one line, ask what they should become.
  if (text.trim().includes("\n") || foreignFormat(text)) {
    editor.ui.pasteAs = { text, at };
    editor.emit();
  } else pastePlainText(editor, text, "text", at);
}

/** Pastes from the clipboard when there is no paste event, as the palette does. */
export async function pasteFromClipboard(
  editor: EditorController,
  session: RoomSession,
  place: PastePlace = { at: pastePoint(editor) }
) {
  if (isLocked(session)) return;
  await pasteText(editor, session, await clipboardText(), place);
}

/**
 * Copy, cut and paste through the browser's own events, so they work wherever the browser lets a
 * page read its clipboard, and the keys keep their meaning in text fields.
 */
export function bindClipboardInput(editor: EditorController, session: RoomSession) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let inPlaceUntil = 0;
  let middleUntil = 0;
  const report = (error: unknown) =>
    session.setNotice(error instanceof Error ? error.message : "That could not be pasted.");
  window.addEventListener(
    "keydown",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v")
        inPlaceUntil = performance.now() + IN_PLACE_WINDOW_MS;
    },
    options
  );
  // On X11 a middle click pastes the primary selection, on press or on release after a drag;
  // here the middle button pans the view.
  for (const type of ["pointerdown", "pointerup"] as const)
    window.addEventListener(
      type,
      (event) => {
        if (event.button === 1) middleUntil = performance.now() + MIDDLE_CLICK_WINDOW_MS;
      },
      { ...options, capture: true }
    );
  window.addEventListener(
    "copy",
    (event) => {
      if (isInputTarget(event.target) || editor.presenter.active) return;
      void copySelection(editor, session, event);
    },
    options
  );
  window.addEventListener(
    "cut",
    (event) => {
      if (isInputTarget(event.target) || editor.presenter.active) return;
      void cutSelection(editor, session, event);
    },
    options
  );
  window.addEventListener(
    "paste",
    (event) => {
      if (isInputTarget(event.target) || editor.presenter.active || isLocked(session)) return;
      if (performance.now() < middleUntil) return;
      const inPlace = performance.now() < inPlaceUntil;
      inPlaceUntil = 0;
      pasteEvent(editor, session, event, inPlace)?.catch(report);
    },
    options
  );
  return () => abort.abort();
}

/** What a paste event carries: a picture file, or text; nothing returns null. */
function pasteEvent(
  editor: EditorController,
  session: RoomSession,
  event: ClipboardEvent,
  inPlace: boolean
) {
  const file = firstImage(event.clipboardData?.files);
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!file && !text.trim()) return null;
  event.preventDefault();
  if (file) return placePictureFile(editor, session, file, pastePoint(editor));
  const place: PastePlace = inPlace ? { inPlace: true } : { at: pastePoint(editor) };
  return pasteText(editor, session, text, place);
}
