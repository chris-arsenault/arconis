import { CanvasDocument } from "./canvasDocument";
import { KIND_LABELS, LOCAL, type CanvasObject, type Bookmark } from "./types";
import { normalizeLegacyObjects } from "./geometry";

export function downloadDocument(document: CanvasDocument) {
  const data = JSON.stringify(
    {
      format: "arconis",
      version: 2,
      title: document.title(),
      objects: document.list(),
      bookmarks: [...document.bookmarks.values()].map((value) => JSON.parse(value) as unknown),
    },
    null,
    2
  );
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title().replace(/[^a-z0-9 -]/gi, "_")}.arconis`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importDocument(document: CanvasDocument, content: string) {
  const parsed = parseFile(content);
  if (!parsed.objects.every(validObject))
    throw new Error("This document contains invalid canvas objects.");
  const objects = parsed.version === 1 ? normalizeLegacyObjects(parsed.objects) : parsed.objects;
  const bookmarks = parsed.bookmarks;
  if (!Array.isArray(bookmarks) || !bookmarks.every(validBookmark))
    throw new Error("This document contains invalid saved views.");
  const ids = new Map(objects.map((item) => [item.id, crypto.randomUUID()]));
  document.undo.stopCapturing();
  document.doc.transact(() => {
    objects.forEach((item) =>
      document.insert({
        ...item,
        id: ids.get(item.id)!,
        parent: ids.get(item.parent) || "",
        source: ids.get(item.source) || "",
        target: ids.get(item.target) || "",
      })
    );
    if (typeof parsed.title === "string") document.rename(parsed.title);
    bookmarks.forEach((bookmark: Bookmark) => {
      const id = crypto.randomUUID();
      document.bookmarks.set(id, JSON.stringify({ ...bookmark, id }));
    });
  }, LOCAL);
  document.undo.stopCapturing();
  return objects.length;
}

function parseFile(content: string): {
  objects: CanvasObject[];
  bookmarks: unknown;
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

function validBookmark(value: unknown): value is Bookmark {
  if (!value || typeof value !== "object") return false;
  const bookmark = value as Bookmark;
  return (
    typeof bookmark.name === "string" &&
    [bookmark.x, bookmark.y, bookmark.scale].every(
      (n) => typeof n === "number" && Number.isFinite(n)
    ) &&
    bookmark.scale > 0
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
