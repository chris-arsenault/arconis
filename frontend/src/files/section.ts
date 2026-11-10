import { CanvasDocument } from "../document/canvasDocument";
import { authoredLook } from "../document/appearance";
import { renameItem } from "../document/relations";
import { newId } from "../document/ids";
import { listComments } from "../document/comments";
import { parse } from "../language/parser";
import { printItems, discussionStatements, quote } from "../language/printer";
import { writeStatements } from "../language/writer";

/** A library insertion carries items and their own appearance, without changing room metadata. */
export function sectionForInsertion(source: string, destination: CanvasDocument) {
  const copy = new CanvasDocument();
  try {
    const result = writeStatements(copy, parse(source), { author: "", importing: true });
    const ids = new Map<string, string>();
    const used = new Set(destination.list().map((item) => item.id));
    for (const item of copy.list()) {
      const fresh = newId((id) => used.has(id));
      used.add(fresh);
      ids.set(item.id, fresh);
    }
    const items = copy.list().map((item) => ({
      ...renameItem(item, ids),
      style: "",
      look: authoredLook(item, copy.styles.get(item.style)),
      layer: destination.activeLayer,
    }));
    const comments = listComments(copy);
    const commentIds = new Map(
      comments.map((comment) => [comment.id, newId((id) => destination.comments.has(id))])
    );
    const threads = comments.map((comment) => ({
      ...comment,
      id: commentIds.get(comment.id)!,
      on: ids.get(comment.on)!,
      thread: commentIds.get(comment.thread) ?? "",
    }));
    const pictures = result.pictures.map(
      (picture) => `data ${picture.hash} ${picture.format} ${quote(picture.data)}`
    );
    return ["arconis 1", printItems(items), ...discussionStatements(threads), ...pictures].join(
      "\n"
    );
  } finally {
    copy.destroy();
  }
}
