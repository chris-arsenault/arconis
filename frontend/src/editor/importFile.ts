import type { RoomSession } from "../collaboration/room";
import { FORMAT_NAMES, IMPORT_EXTENSIONS, fileFormat } from "../interchange";
import { pasteForeign, pastePoint } from "./clipboard";
import type { EditorController } from "./controller";

/** What Import offers: canvas files, pictures carrying one, and other tools' diagrams and outlines. */
export const IMPORT_ACCEPT = [
  ".arconis",
  "application/json",
  ".png",
  "image/png",
  ...IMPORT_EXTENSIONS,
].join(",");

const isPicture = (file: File) =>
  file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".png");

/**
 * Imports a file another tool wrote as native objects in the middle of the view. Returns what to
 * tell the person, or null when the file is a canvas file or picture for the ordinary import.
 */
export async function importForeignFile(
  editor: EditorController,
  session: RoomSession,
  file: File
) {
  if (isPicture(file)) return null;
  const text = await file.text();
  const format = fileFormat(file.name, text);
  if (!format) return null;
  const created = await pasteForeign(editor, session, text, format, pastePoint(editor));
  return `Imported ${created.length} objects from the ${FORMAT_NAMES[format]}.`;
}
