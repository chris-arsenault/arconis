import { z } from "zod";
import { CanvasDocument } from "../document/canvasDocument";
import { listComments, MAX_COMMENT_LENGTH } from "../document/comments";
import {
  PICTURE_HASH,
  PICTURE_STORED,
  PICTURE_TYPE,
  type FilePictures,
} from "../document/pictures";
import { LINE_ANCHOR, RELATION_BRANCH, RELATION_REFERENCE } from "../document/relations";
import { LOCAL, type CanvasObject, type ObjectKind, type StyleValue } from "../document/types";
import { arrowStyle, routeStyle, writeLook } from "./look";
import {
  isBoxItem,
  toDiscussions,
  toItem,
  readViews,
  type DomainItem,
  type Stencil,
} from "./model";
import { discussionSchema, itemSchema, viewSchema } from "./schema";

/**
 * Version 3 of the Arconis file: the domain read model written out. Items are listed back to front,
 * refer to each other by id, and say what holds them with `inside`.
 */
export const FORMAT_VERSION = 3;

const pictureEntry = z.object({ hash: z.string(), type: z.string(), data: z.string() });
export const fileSchema = z.object({
  format: z.literal("arconis"),
  version: z.literal(FORMAT_VERSION),
  title: z.string().max(500).default("Untitled canvas"),
  items: z
    .array(itemSchema)
    .describe(
      "Every item, back to front: later items draw over earlier ones. Items refer to each other by id. A topic tree's root is the node no branch points to"
    ),
  discussions: z.array(discussionSchema).default([]),
  views: z.array(viewSchema).default([]),
  pictures: z.array(pictureEntry).default([]).describe("Picture bytes, base64, named by hash"),
});
export type ArconisFile = z.infer<typeof fileSchema>;

const NODE_KINDS: Record<Stencil, ObjectKind> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  decision: "diamond",
  service: "service",
  database: "database",
  cloud: "cloud",
  person: "person",
  icon: "icon",
};

/** The canvas, or just the named items and what they hold, as a version 3 file. */
export function exportFile(
  document: CanvasDocument,
  ids: string[] = [],
  { pictures, renames }: FilePictures = { pictures: [], renames: new Map() }
) {
  const objects = document.list();
  const present = new Set(objects.map((object) => object.id));
  const chosen = new Set(ids);
  const items = objects
    .filter((object) => !ids.length || chosen.has(object.id))
    .map((object) => renamed(toItem(object, present), renames))
    .map((item) =>
      ids.length && item.inside && !chosen.has(item.inside) ? { ...item, inside: undefined } : item
    );
  const kept = new Set(items.map((item) => item.id));
  const file: ArconisFile = {
    format: "arconis",
    version: FORMAT_VERSION,
    title: document.title(),
    items: items as ArconisFile["items"],
    discussions: toDiscussions(listComments(document)).filter((d) => kept.has(d.on)),
    views: ids.length ? [] : readViews(document),
    pictures,
  };
  return JSON.stringify(file, null, 2);
}

function renamed(item: DomainItem, renames: Map<string, string>): DomainItem {
  if (item.type !== "picture" || !renames.has(item.picture.hash)) return item;
  return { ...item, picture: { ...item.picture, hash: renames.get(item.picture.hash)! } };
}

/** Reads a version 3 file, explaining the first problem in terms of the file's content. */
export function parseFile(content: unknown): ArconisFile {
  const result = fileSchema.safeParse(content);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `This Arconis file is not valid at ${issue.path.join(".") || "the top level"}: ${issue.message}`
    );
  }
  checkReferences(result.data.items);
  return result.data;
}

function checkReferences(items: ArconisFile["items"]) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Two items share the id "${item.id}".`);
    ids.add(item.id);
  }
  for (const item of items) {
    const refs = [
      item.inside,
      "from" in item ? item.from : undefined,
      "to" in item ? item.to : undefined,
    ];
    if (item.type === "node" && item.onLine) refs.push(item.onLine);
    const missing = refs.find((ref) => ref !== undefined && !ids.has(ref));
    if (missing)
      throw new Error(`Item "${item.id}" refers to "${missing}", which is not in the file.`);
  }
}

function boxKind(item: ArconisFile["items"][number]): ObjectKind {
  if (item.type === "node") return NODE_KINDS[item.stencil];
  if (item.type === "region") return item.frame;
  if (item.type === "text") return item.note ? "sticky" : "text";
  if (item.type === "picture") return "picture";
  return item.type === "drawing" ? "stroke" : "connector";
}

function boxStyle(item: ArconisFile["items"][number], ids: Map<string, string>) {
  const style: Record<string, StyleValue> = {};
  if (item.type === "node" && item.icon) style.icon = item.icon;
  if (item.type === "node" && item.onLine) style[LINE_ANCHOR] = ids.get(item.onLine)!;
  if (item.type === "picture")
    Object.assign(style, {
      [PICTURE_HASH]: item.picture.hash,
      [PICTURE_TYPE]: item.picture.type,
      [PICTURE_STORED]: item.picture.stored,
    });
  return style;
}

/** The styles a link type carries before its own look, so a minimal file still draws correctly. */
function linkStyle(item: ArconisFile["items"][number]) {
  const style: Record<string, StyleValue> = {};
  if (item.type === "branch") Object.assign(style, { relation: RELATION_BRANCH, endArrow: "none" });
  if (item.type === "reference")
    Object.assign(style, {
      relation: RELATION_REFERENCE,
      dashed: true,
      edgeStyle: "none",
      endArrow: "open",
      strokeColor: "#a797cc",
    });
  if (item.type === "connection")
    Object.assign(style, { edgeStyle: routeStyle(item.route), endArrow: arrowStyle(item.arrow) });
  if ("fromPoint" in item && item.fromPoint)
    Object.assign(style, { exitX: item.fromPoint.x, exitY: item.fromPoint.y });
  if ("toPoint" in item && item.toPoint)
    Object.assign(style, { entryX: item.toPoint.x, entryY: item.toPoint.y });
  return style;
}

/** One file item as a stored object, with ids already rewritten for this canvas. */
function toObject(
  document: CanvasDocument,
  item: ArconisFile["items"][number],
  ids: Map<string, string>,
  order: number
): CanvasObject {
  const kind = boxKind(item);
  const draft = document.build(kind, 0, 0);
  const style = {
    ...draft.style,
    ...item.extra,
    ...(isBoxItem(item as DomainItem) ? boxStyle(item, ids) : linkStyle(item)),
    ...writeLook(item.look ?? {}),
  };
  const geometry =
    "width" in item ? { x: item.x, y: item.y, width: item.width, height: item.height } : {};
  let points: [number, number][] = [];
  if (item.type === "drawing") points = item.points;
  else if ("via" in item && item.via) points = item.via;
  return {
    ...draft,
    ...geometry,
    id: ids.get(item.id)!,
    label: item.name,
    parent: item.inside ? ids.get(item.inside)! : "",
    source: "from" in item ? ids.get(item.from)! : "",
    target: "to" in item ? ids.get(item.to)! : "",
    points: JSON.stringify(points),
    order,
    style,
  };
}

/** A file's items as stored objects under their own ids, for reading a file without a canvas. */
export function fileObjects(file: ArconisFile) {
  const scratch = new CanvasDocument();
  try {
    const ids = new Map(file.items.map((item) => [item.id, item.id]));
    return file.items.map((item, index) => toObject(scratch, item, ids, index));
  } finally {
    scratch.destroy();
  }
}

/** Pictures named in a file's items, renamed where storing them gave them another name. */
export function renameFileItems(file: ArconisFile, renames: Map<string, string>): ArconisFile {
  if (!renames.size) return file;
  return {
    ...file,
    items: file.items.map((item) =>
      item.type === "picture" && renames.has(item.picture.hash)
        ? { ...item, picture: { ...item.picture, hash: renames.get(item.picture.hash)! } }
        : item
    ),
  };
}

/** Adds a version 3 file's content to the canvas as one undo step. Returns how many items. */
export function importFile(document: CanvasDocument, file: ArconisFile) {
  const ids = new Map(file.items.map((item) => [item.id, crypto.randomUUID()]));
  const base = document.nextOrder();
  document.undo.stopCapturing();
  document.doc.transact(() => {
    file.items.forEach((item, index) =>
      document.insert(toObject(document, item, ids, base + index))
    );
    importDiscussions(document, file.discussions, ids);
    if (file.title) document.rename(file.title);
    file.views.forEach((view) => {
      const id = crypto.randomUUID();
      const center = view.center ?? { x: 0, y: 0 };
      document.views.set(
        id,
        JSON.stringify({
          id,
          name: view.name,
          centerX: center.x,
          centerY: center.y,
          x: -center.x,
          y: -center.y,
          scale: view.zoom,
        })
      );
    });
  }, LOCAL);
  document.undo.stopCapturing();
  return file.items.length;
}

function importDiscussions(
  document: CanvasDocument,
  discussions: ArconisFile["discussions"],
  ids: Map<string, string>
) {
  for (const discussion of discussions) {
    const objectId = ids.get(discussion.on);
    if (!objectId) continue;
    const root = crypto.randomUUID();
    discussion.comments.forEach((comment, position) => {
      const id = position ? crypto.randomUUID() : root;
      const record = {
        id,
        objectId,
        thread: position ? root : "",
        author: comment.author,
        text: comment.text.slice(0, MAX_COMMENT_LENGTH),
        time: comment.time,
        resolved: position ? false : discussion.resolved,
      };
      document.comments.set(id, JSON.stringify(record));
    });
  }
}
