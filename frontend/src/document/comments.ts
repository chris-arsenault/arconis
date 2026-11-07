import type { CanvasDocument } from "./canvasDocument";
import { LOCAL } from "./types";
import { newId } from "./ids";

export const MAX_COMMENT_LENGTH = 4000;

/**
 * One comment. Each is its own record, so concurrent comments never conflict; a discussion is a
 * first comment and the replies that name it as their thread.
 */
export interface CanvasComment {
  id: string;
  /** The item the discussion is about. */
  on: string;
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
      [comment.id, comment.on, comment.thread, comment.author, comment.text].every(
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
 * Comments in time order, leaving out those whose item is gone. Their records stay, so undoing a
 * deletion brings the comments back with the item.
 */
export function listComments(document: CanvasDocument) {
  const comments: CanvasComment[] = [];
  document.comments.forEach((value) => {
    const comment = parseComment(value);
    if (comment && document.items.has(comment.on)) comments.push(comment);
  });
  return comments.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function groupThreads(comments: CanvasComment[], itemId: string) {
  const own = comments.filter((comment) => comment.on === itemId);
  return own
    .filter((comment) => !comment.thread)
    .map((root): CommentThread => ({
      root,
      replies: own.filter((comment) => comment.thread === root.id),
    }));
}

/** How many unresolved threads each item has. */
export function openThreadCounts(comments: CanvasComment[]) {
  const counts = new Map<string, number>();
  comments
    .filter((comment) => !comment.thread && !comment.resolved)
    .forEach((comment) => counts.set(comment.on, (counts.get(comment.on) ?? 0) + 1));
  return counts;
}

export function writeComment(document: CanvasDocument, comment: CanvasComment) {
  document.doc.transact(() => document.comments.set(comment.id, JSON.stringify(comment)), LOCAL);
}

export function addComment(
  document: CanvasDocument,
  values: Pick<CanvasComment, "on" | "author" | "text"> & Partial<Pick<CanvasComment, "thread">>
) {
  const comment: CanvasComment = {
    id: newId((id) => document.comments.has(id)),
    thread: "",
    time: Date.now(),
    resolved: false,
    ...values,
    text: values.text.slice(0, MAX_COMMENT_LENGTH),
  };
  writeComment(document, comment);
  return comment.id;
}

export function setResolved(document: CanvasDocument, id: string, resolved: boolean) {
  const comment = parseComment(document.comments.get(id));
  if (comment) writeComment(document, { ...comment, resolved });
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
