import type { CanvasDocument } from "../document/canvasDocument";
import { LOCAL } from "../document/types";
import { NO_PICTURES, type FilePictures } from "../document/pictures";
import { isPng, readCopy } from "../document/pngCopy";
import { parse } from "../language/parser";
import { printCanvas } from "../language/printer";
import { writeStatements } from "../language/writer";

/**
 * A file is the canvas written in the canvas language, the same text agents read and write. Picture
 * bytes ride along at the end so the file opens anywhere.
 */
export function serializeDocument(
  document: CanvasDocument,
  ids: string[] = [],
  pictures: FilePictures = NO_PICTURES,
  includeMarkup = true
) {
  let text = printCanvas(document, {
    ids,
    includeMarkup,
    data: pictures.pictures.map(({ hash, type, data }) => ({ hash, type, data })),
  });
  // A password room names pictures by their sealed bytes; a file names them by their plain bytes.
  pictures.renames.forEach((plain, sealed) => (text = text.replaceAll(sealed, plain)));
  return text;
}

/** Reads a chosen file as canvas text, whether it is a canvas file or a picture carrying one. */
export async function readDocumentFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPng(bytes)) return new TextDecoder().decode(bytes);
  const copy = await readCopy(bytes);
  if (copy === null) throw new Error("This picture has no canvas inside it.");
  return copy;
}

/**
 * Adds a file's canvas to this one as one undoable change, keeping the file's ids where they are
 * free. `renames` points pictures at the names they were kept under here.
 */
export function importDocument(
  document: CanvasDocument,
  content: string,
  renames: Map<string, string> = new Map()
) {
  let text = content;
  renames.forEach((kept, original) => (text = text.replaceAll(original, kept)));
  const statements = parse(text);
  if (!statements.some((statement) => statement.kind === "header"))
    throw new Error("Choose an Arconis canvas file (.arconis).");
  document.undo.stopCapturing();
  let created = 0;
  document.doc.transact(() => {
    const result = writeStatements(document, statements, { author: "", importing: true });
    created = result.created.length;
    if (renames.size) unstorePictures(document, result.created, new Set(renames.values()));
  }, LOCAL);
  document.undo.stopCapturing();
  return created;
}

/** Pictures kept under a new name have not reached shared storage under it yet. */
function unstorePictures(document: CanvasDocument, ids: string[], renamed: Set<string>) {
  for (const id of ids) {
    const picture = document.get(id)?.picture;
    if (picture && renamed.has(picture.hash))
      document.patch(id, { picture: { ...picture, stored: false } });
  }
}
