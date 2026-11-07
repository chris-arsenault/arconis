import { CanvasDocument } from "./canvasDocument";
import { KIND_LABELS, LOCAL, type CanvasObject, type SavedView } from "./types";
import { normalizeLegacyObjects } from "./geometry";
import { exportComments, importComments } from "./comments";
import { isPng, readCopy } from "./pngCopy";
import { remapStyle } from "./relations";

/** The portable form of a document, or of just the named objects, without its saved views. */
export function serializeDocument(document: CanvasDocument, ids: string[] = []) {
  const chosen = new Set(ids);
  return JSON.stringify(
    {
      format: "arconis",
      version: 2,
      title: document.title(),
      objects: ids.length ? document.list().filter((item) => chosen.has(item.id)) : document.list(),
      comments: exportComments(document, ids),
      bookmarks: ids.length
        ? []
        : [...document.views.values()].map((value) => JSON.parse(value) as unknown),
    },
    null,
    2
  );
}

export function downloadFile(
  document: CanvasDocument,
  content: BlobPart,
  type: string,
  ext: string
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title().replace(/[^a-z0-9 -]/gi, "_")}.${ext}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDocument(document: CanvasDocument) {
  downloadFile(document, serializeDocument(document), "application/json", "arconis");
}

/** Reads a chosen file as document text, whether it is a document or a picture carrying one. */
export async function readDocumentFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPng(bytes)) return new TextDecoder().decode(bytes);
  const copy = await readCopy(bytes);
  if (copy === null) throw new Error("This picture has no canvas inside it.");
  return copy;
}

export function importDocument(document: CanvasDocument, content: string) {
  const parsed = parseFile(content);
  if (!parsed.objects.every(validObject))
    throw new Error("This document contains invalid canvas objects.");
  const objects = parsed.version === 1 ? normalizeLegacyObjects(parsed.objects) : parsed.objects;
  const bookmarks = parsed.bookmarks;
  if (!Array.isArray(bookmarks) || !bookmarks.every(validView))
    throw new Error("This document contains invalid saved views.");
  const ids = new Map(objects.map((item) => [item.id, crypto.randomUUID()]));
  const base = document.nextOrder();
  const stacked = objects
    .map((item, index) => ({ item, index }))
    .sort((left, right) => fileOrder(left.item) - fileOrder(right.item) || left.index - right.index)
    .map(({ item }) => item);
  document.undo.stopCapturing();
  document.doc.transact(() => {
    stacked.forEach((item, index) =>
      document.insert({
        ...item,
        order: base + index,
        id: ids.get(item.id)!,
        parent: ids.get(item.parent) || "",
        source: ids.get(item.source) || "",
        target: ids.get(item.target) || "",
        style: remapStyle(item.style, ids),
      })
    );
    importComments(document, parsed.comments, ids);
    if (typeof parsed.title === "string") document.rename(parsed.title);
    bookmarks.forEach((view: SavedView) => {
      const id = crypto.randomUUID();
      document.views.set(id, JSON.stringify({ ...view, id }));
    });
  }, LOCAL);
  document.undo.stopCapturing();
  return objects.length;
}

function fileOrder(item: CanvasObject) {
  return Number.isFinite(item.order) ? item.order : 0;
}

function parseFile(content: string): {
  objects: CanvasObject[];
  bookmarks: unknown;
  comments: unknown;
  title: unknown;
  version: number;
} {
  const parsed: unknown = JSON.parse(content);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("format" in parsed) ||
    parsed.format !== "arconis" ||
    !("objects" in parsed) ||
    !Array.isArray(parsed.objects)
  )
    throw new Error("Choose an Arconis document (.arconis).");
  return {
    objects: parsed.objects as CanvasObject[],
    bookmarks: "bookmarks" in parsed ? parsed.bookmarks : [],
    comments: "comments" in parsed ? parsed.comments : [],
    title: "title" in parsed ? parsed.title : null,
    version: fileVersion(parsed),
  };
}

function fileVersion(parsed: object) {
  const version = "version" in parsed ? parsed.version : 1;
  if (version !== 1 && version !== 2)
    throw new Error("This Arconis file version is not supported.");
  return version;
}

function validView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const view = value as SavedView;
  return (
    typeof view.name === "string" &&
    [view.x, view.y, view.scale].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    [view.centerX, view.centerY].every((n) => n === undefined || Number.isFinite(n)) &&
    view.scale > 0
  );
}

function validObject(item: CanvasObject) {
  if (!item || !(item.kind in KIND_LABELS)) return false;
  if (
    ![item.id, item.label, item.parent, item.source, item.target, item.points].every(
      (value) => typeof value === "string"
    )
  )
    return false;
  if (
    ![item.x, item.y, item.width, item.height].every(
      (value) => typeof value === "number" && Number.isFinite(value)
    )
  )
    return false;
  if (!item.style || typeof item.style !== "object") return false;
  try {
    const points: unknown = JSON.parse(item.points);
    return (
      Array.isArray(points) &&
      points.every(
        (point: unknown) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
      )
    );
  } catch {
    return false;
  }
}
