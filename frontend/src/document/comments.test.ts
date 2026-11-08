import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "./canvasDocument";
import {
  MAX_COMMENT_LENGTH,
  addComment,
  deleteComment,
  groupThreads,
  listComments,
  openThreadCounts,
  parseComment,
  setResolved,
} from "./comments";
import { importDocument, serializeDocument } from "../files/canvasFile";

const docs: CanvasDocument[] = [];
function fresh() {
  const document = new CanvasDocument();
  docs.push(document);
  return document;
}
afterEach(() => docs.splice(0).forEach((document) => document.destroy()));

function exchange(a: CanvasDocument, b: CanvasDocument) {
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
}

describe("threads", () => {
  it("groups replies under their first comment, in time order", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    const root = addComment(document, { on: box, author: "A", text: "Why?" });
    addComment(document, { on: box, author: "B", text: "Because", thread: root });
    const [thread] = groupThreads(listComments(document), box);
    expect(thread.root.text).toBe("Why?");
    expect(thread.replies.map((reply) => reply.text)).toEqual(["Because"]);
  });

  it("counts only unresolved threads", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    const first = addComment(document, { on: box, author: "A", text: "1" });
    addComment(document, { on: box, author: "A", text: "2" });
    addComment(document, { on: box, author: "A", text: "reply", thread: first });
    expect(openThreadCounts(listComments(document)).get(box)).toBe(2);
    setResolved(document, first, true);
    expect(openThreadCounts(listComments(document)).get(box)).toBe(1);
    setResolved(document, first, false);
    expect(openThreadCounts(listComments(document)).get(box)).toBe(2);
  });

  it("deletes a thread with its replies, and a reply on its own", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    const root = addComment(document, { on: box, author: "A", text: "root" });
    const reply = addComment(document, { on: box, author: "A", text: "x", thread: root });
    addComment(document, { on: box, author: "A", text: "y", thread: root });
    deleteComment(document, reply);
    expect(listComments(document)).toHaveLength(2);
    deleteComment(document, root);
    expect(listComments(document)).toEqual([]);
  });

  it("limits comment length", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    addComment(document, { on: box, author: "A", text: "x".repeat(MAX_COMMENT_LENGTH + 5) });
    expect(listComments(document)[0].text).toHaveLength(MAX_COMMENT_LENGTH);
  });
});

describe("collaboration", () => {
  it("keeps comments two people add at once", () => {
    const [a, b] = [fresh(), fresh()];
    const box = a.create("node", 0, 0);
    exchange(a, b);
    addComment(a, { on: box, author: "A", text: "from a" });
    addComment(b, { on: box, author: "B", text: "from b" });
    exchange(a, b);
    expect(listComments(a).map((c) => c.text)).toEqual(listComments(b).map((c) => c.text));
    expect(listComments(a)).toHaveLength(2);
  });

  it("ignores malformed records from a peer", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    document.comments.set("bad", "not json");
    document.comments.set("worse", JSON.stringify({ on: box, text: 5 }));
    expect(listComments(document)).toEqual([]);
    expect(parseComment(null)).toBeNull();
  });
});

describe("the object's lifetime", () => {
  it("hides comments with a deleted object and restores them on undo", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    addComment(document, { on: box, author: "A", text: "kept" });
    document.remove([box]);
    expect(listComments(document)).toEqual([]);
    document.undo.undo();
    expect(listComments(document).map((c) => c.text)).toEqual(["kept"]);
  });

  it("does not join undo of ordinary edits", () => {
    const document = fresh();
    const box = document.create("node", 0, 0);
    document.undo.stopCapturing();
    addComment(document, { on: box, author: "A", text: "stays" });
    document.undo.undo();
    expect(document.get(box)).toBeNull();
    document.undo.redo();
    expect(listComments(document)).toHaveLength(1);
  });
});

describe("files", () => {
  it("carries discussions through a file, following items given new ids", () => {
    const source = fresh();
    const box = source.create("node", 0, 0, { name: "Box" });
    const root = addComment(source, { on: box, author: "A", text: "root" });
    addComment(source, { on: box, author: "B", text: "reply", thread: root });
    setResolved(source, root, true);
    const target = fresh();
    target.create("node", 0, 0, { id: box, name: "Already here" });
    importDocument(target, serializeDocument(source));
    const copy = target.list().find((item) => item.name === "Box")!;
    expect(copy.id).not.toBe(box);
    const [thread] = groupThreads(listComments(target), copy.id);
    expect(thread.root).toMatchObject({ author: "A", resolved: true });
    expect(thread.replies[0].text).toBe("reply");
  });

  it("exports only a selection's discussions", () => {
    const source = fresh();
    const [a, b] = [source.create("node", 0, 0), source.create("node", 0, 0)];
    addComment(source, { on: a, author: "A", text: "on a" });
    addComment(source, { on: b, author: "A", text: "on b" });
    const target = fresh();
    importDocument(target, serializeDocument(source, [a]));
    expect(listComments(target).map((c) => c.text)).toEqual(["on a"]);
  });
});
