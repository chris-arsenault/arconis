import { useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import {
  addComment,
  deleteComment,
  groupThreads,
  listComments,
  setResolved,
  type CanvasComment,
} from "../document/comments";
import { anchorOf } from "../document/relations";
import { isVertexKind } from "../document/geometry";
import type { CanvasObject } from "../document/types";
import type { EditorController } from "../editor/controller";
import { endpointFor } from "../editor/topics";
import { Section } from "./ConnectionControls";

function CommentBody({
  editor,
  comment,
}: Readonly<{ editor: EditorController; comment: CanvasComment }>) {
  return (
    <div className="comment">
      <div className="comment-meta">
        <strong>{comment.author}</strong>
        <time>{new Date(comment.time).toLocaleString()}</time>
        <button
          className="icon-action"
          aria-label={`Delete comment by ${comment.author}`}
          title="Delete"
          onClick={() => {
            deleteComment(editor.document, comment.id);
            editor.emit();
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <p>{comment.text}</p>
    </div>
  );
}

function CommentBox({
  label,
  placeholder,
  onSubmit,
}: Readonly<{ label: string; placeholder: string; onSubmit: (text: string) => void }>) {
  const [text, setText] = useState("");
  return (
    <form
      className="comment-box"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        onSubmit(text.trim());
        setText("");
      }}
    >
      <input
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </form>
  );
}

/** Threads on the selected object. A line's comments sit on its anchor, as its other links do. */
export function CommentControls({
  editor,
  item,
  author,
}: Readonly<{ editor: EditorController; item: CanvasObject; author: string }>) {
  const items = editor.document.list();
  const targetId = isVertexKind(item.kind) ? item.id : (anchorOf(items, item.id)?.id ?? "");
  const threads = groupThreads(listComments(editor.document), targetId);
  const add = (text: string, thread = "") => {
    const objectId = thread ? targetId : endpointFor(editor, item);
    if (objectId) addComment(editor.document, { objectId, author, text, thread });
    editor.emit();
  };
  return (
    <Section title="Comments">
      {threads.map(({ root, replies }) => (
        <div
          key={root.id}
          className={root.resolved ? "comment-thread resolved" : "comment-thread"}
          data-testid="comment-thread"
        >
          <CommentBody editor={editor} comment={root} />
          {replies.map((reply) => (
            <CommentBody key={reply.id} editor={editor} comment={reply} />
          ))}
          <div className="comment-actions">
            <CommentBox
              label={`Reply to ${root.author}`}
              placeholder="Reply"
              onSubmit={(text) => add(text, root.id)}
            />
            <button
              className="icon-action"
              aria-label={root.resolved ? "Reopen thread" : "Resolve thread"}
              title={root.resolved ? "Reopen" : "Resolve"}
              onClick={() => {
                setResolved(editor.document, root.id, !root.resolved);
                editor.emit();
              }}
            >
              {root.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
            </button>
          </div>
        </div>
      ))}
      <CommentBox
        label="Add a comment"
        placeholder="Add a comment"
        onSubmit={(text) => add(text)}
      />
    </Section>
  );
}
