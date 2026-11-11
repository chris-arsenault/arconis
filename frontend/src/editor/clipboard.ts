import type { RoomSession } from "../collaboration/room";
import { LOCAL, isBox } from "../document/types";
import { worldBounds } from "../document/relations";
import { offsetPoints } from "../document/geometry";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import type { EditorController } from "./controller";
import { pasteStatements, type PasteForm } from "./pasteAs";
import { creationSize } from "./zoom";
import { fitText } from "./textLayout";

/**
 * The clipboard carries the canvas language, the same text files hold and agents read, so a
 * selection pastes into any room, and language from anywhere pastes as objects.
 */

/** What this page last copied, for when the clipboard cannot be read back. */
let lastCopied = "";

type Point = { x: number; y: number };

/** Where a paste lands: at a world point, or where the objects were. */
export type PastePlace = { at: Point } | { inPlace: true };

/** Whether text is canvas language worth writing: a file, or statements that declare items. */
export function looksLikeLanguage(text: string) {
  if (/^\s*arconis\s+\d/.test(text)) return true;
  try {
    const statements = parse(text);
    return (
      statements.length > 0 &&
      statements.every((statement) =>
        ["item", "link", "style", "arrange", "title", "discussion", "data"].includes(statement.kind)
      ) &&
      statements.some((statement) => ["item", "link", "arrange"].includes(statement.kind))
    );
  } catch {
    return false;
  }
}

/** The selection, with what it holds, in the canvas language with its pictures. */
export async function selectionText(editor: EditorController, session: RoomSession) {
  const ids = editor.selectionClosure();
  if (!ids.length) return "";
  return session.files.canvas(ids);
}

async function writeClipboard(text: string) {
  lastCopied = text;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies the selection. The `copy` event's data is set at once, and the full text follows. */
export async function copySelection(
  editor: EditorController,
  session: RoomSession,
  event?: ClipboardEvent
) {
  const ids = editor.selectionClosure();
  if (!ids.length) return false;
  if (event?.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData("text/plain", await session.files.canvas(ids));
  }
  const text = await selectionText(editor, session);
  if (!text) return false;
  await writeClipboard(text);
  return true;
}

export async function cutSelection(
  editor: EditorController,
  session: RoomSession,
  event?: ClipboardEvent
) {
  const copied = await copySelection(editor, session, event);
  if (copied) editor.remove();
  return copied;
}

/** The world point a keyboard paste lands at: under the pointer, or the middle of the window. */
export function pastePoint(editor: EditorController): Point {
  if (editor.pointer) return editor.worldPoint(editor.pointer);
  const { scale, translate } = editor.graph.view;
  return {
    x: editor.element.clientWidth / 2 / scale - translate.x,
    y: editor.element.clientHeight / 2 / scale - translate.y,
  };
}

/** Moves newly written items so their bounds are centred on a point, within the same change. */
function centreOn(editor: EditorController, created: string[], at: Point) {
  const { document } = editor;
  const items = created.map((id) => document.get(id)).filter((item) => item !== null);
  const bounds = worldBounds(items);
  if (!bounds) return;
  const dx = at.x - (bounds.x + bounds.width / 2);
  const dy = at.y - (bounds.y + bounds.height / 2);
  for (const item of items) {
    if (isBox(item)) document.patch(item.id, { x: item.x + dx, y: item.y + dy });
    else if (item.points.length)
      document.patch(item.id, { points: offsetPoints(item.points, dx, dy) });
  }
}

function selectCreated(editor: EditorController, created: string[]) {
  const model = editor.graph.getDataModel();
  editor.graph.setSelectionCells(
    created.map((id) => model.getCell(id)).filter((cell) => cell !== null)
  );
  editor.emit();
}

/** Pastes canvas language as objects, placed as asked, and selects them. */
export async function pasteLanguage(
  editor: EditorController,
  session: RoomSession,
  text: string,
  place: PastePlace
) {
  const content = /^\s*arconis\s+\d/.test(text) ? text : `arconis 1\n${text}`;
  const created = await session.files.paste(content, (ids) => {
    if ("at" in place) centreOn(editor, ids, place.at);
  });
  selectCreated(editor, created);
  return created;
}

/** Writes plain text as objects in the chosen form, centred on a point, as one undo step. */
export function pastePlainText(editor: EditorController, text: string, form: PasteForm, at: Point) {
  const { document } = editor;
  const [selected] = editor.selected();
  const under = form === "tree" && selected && isBox(selected) ? selected.id : "";
  const statements = parse(pasteStatements(text, form, under).join("\n"));
  const scale = editor.graph.view.scale;
  document.undo.stopCapturing();
  let created: string[] = [];
  document.doc.transact(() => {
    created = writeStatements(document, statements, { author: document.author }).created;
    const boxes = created.map((id) => document.get(id)).filter((item) => item !== null);
    for (const item of boxes) {
      if (!isBox(item) || item.onLine) continue;
      // New objects take the size they would have been drawn at this zoom.
      const size = creationSize(item.type, scale, item.stencil);
      if (item.type === "text") document.patch(item.id, { width: size.width * 2 });
      else document.patch(item.id, size);
    }
    if (!under) centreOn(editor, created, at);
  }, LOCAL);
  document.undo.stopCapturing();
  created.forEach((id) => void fitText(document, id));
  selectCreated(editor, created);
  return created;
}

/** Drops pasted lines that were waiting for a form, returning focus to the canvas. */
export function dismissPasteAs(editor: EditorController) {
  editor.ui.pasteAs = null;
  editor.emit();
  editor.element.focus({ preventScroll: true });
}

/** Reads the clipboard's text, or falls back to what this page copied last. */
export async function clipboardText() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  } catch {
    // Reading needs a permission some browsers never grant; the page's own copy still works.
  }
  return lastCopied;
}
