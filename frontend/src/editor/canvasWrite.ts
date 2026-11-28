import { LOCAL } from "../document/types";
import type { CanvasDocument } from "../document/canvasDocument";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";

/** A local canvas-language edit has the same atomic writer as an agent and one browser undo step. */
export function writeCanvas(doc: CanvasDocument, statements: string) {
  doc.undo.stopCapturing();
  try {
    doc.doc.transact(() => writeStatements(doc, parse(statements), { author: doc.author }), LOCAL);
  } finally {
    doc.undo.stopCapturing();
  }
}
