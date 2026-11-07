import type { CanvasDocument } from "./canvasDocument";
import { LOCAL } from "./types";

export const MAX_COMMENT_LENGTH = 4000;

/** One comment. Each is its own record, so concurrent comments never conflict. */
export interface CanvasComment {
  id: string;
  objectId: string;
  /** The first comment of the thread this replies to; empty for a thread's first comment. */
  thread: string;
  /** The display name at the time. Rooms have no accounts, so it is a claim, not an identity. */
  author: string;
  text: string;
  time: number;
  resolved: boolean;
}

export interface CommentThread {
  root: CanvasComment;
  replies: CanvasComment[];
}

/** Peers write these records, so anything malformed is ignored rather than trusted. */
export function parseComment(value: unknown): CanvasComment | null {
  try {
    const comment = (typeof value === "string" ? JSON.parse(value) : value) as CanvasComment;
    const valid =
      [comment.id, comment.objectId, comment.thread, comment.author, comment.text].every(
        (field) => typeof field === "string"
      ) &&
      Number.isFinite(comment.time) &&
      typeof comment.resolved === "boolean";
    return valid ? comment : null;
  } catch {
    return null;
  }
}

/**
 * Comments in time order, leaving out those whose object is gone. Their records stay, so undoing a
 * deletion brings the comments back with the object.
 */
export function listComments(document: CanvasDocument) {
  const comments: CanvasComment[] = [];
  document.comments.forEach((value) => {
    const comment = parseComment(value);
    if (comment && document.objects.has(comment.objectId)) comments.push(comment);
  });
  return comments.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function groupThreads(comments: CanvasComment[], objectId: string) {
  const own = comments.filter((comment) => comment.objectId === objectId);
  return own
    .filter((comment) => !comment.thread)
    .map((root): CommentThread => ({
      root,
      replies: own.filter((comment) => comment.thread === root.id),
    }));
}

/** How many unresolved threads each object has. */
export function openThreadCounts(comments: CanvasComment[]) {
  const counts = new Map<string, number>();
  comments
    .filter((comment) => !comment.thread && !comment.resolved)
    .forEach((comment) => counts.set(comment.objectId, (counts.get(comment.objectId) ?? 0) + 1));
  return counts;
}

function write(document: CanvasDocument, comment: CanvasComment) {
  document.doc.transact(() => document.comments.set(comment.id, JSON.stringify(comment)), LOCAL);
}

export function addComment(
  document: CanvasDocument,
  values: Pick<CanvasComment, "objectId" | "author" | "text"> &
    Partial<Pick<CanvasComment, "thread">>
) {
  const comment: CanvasComment = {
    id: crypto.randomUUID(),
    thread: "",
    time: Date.now(),
    resolved: false,
    ...values,
    text: values.text.slice(0, MAX_COMMENT_LENGTH),
  };
  write(document, comment);
  return comment.id;
}

export function setResolved(document: CanvasDocument, id: string, resolved: boolean) {
  const comment = parseComment(document.comments.get(id));
  if (comment) write(document, { ...comment, resolved });
}

/** Removes a comment, and with a thread's first comment, its replies. */
export function deleteComment(document: CanvasDocument, id: string) {
  document.doc.transact(() => {
    document.comments.delete(id);
    document.comments.forEach((value, key) => {
      if (parseComment(value)?.thread === id) document.comments.delete(key);
    });
  }, LOCAL);
}

/** Portable comments for the named objects, or for everything still present. */
export function exportComments(document: CanvasDocument, ids: string[] = []) {
  const chosen = new Set(ids);
  return listComments(document).filter((comment) => !ids.length || chosen.has(comment.objectId));
}

/** Adds comments from a file, rewriting their object and comment identifiers. */
export function importComments(
  document: CanvasDocument,
  values: unknown,
  objectIds: Map<string, string>
) {
  if (!Array.isArray(values)) return;
  const comments = values.map(parseComment).filter((comment) => comment !== null);
  const ids = new Map(comments.map((comment) => [comment.id, crypto.randomUUID()]));
  for (const comment of comments) {
    const objectId = objectIds.get(comment.objectId);
    if (!objectId) continue;
    write(document, {
      ...comment,
      id: ids.get(comment.id)!,
      objectId,
      thread: ids.get(comment.thread) ?? "",
    });
  }
}
