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
import type { Item } from "../document/types";
import type { EditorController } from "../editor/controller";
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

/** Threads on the selected item, including lines. */
export function CommentControls({
  editor,
  item,
  author,
}: Readonly<{ editor: EditorController; item: Item; author: string }>) {
  const threads = groupThreads(listComments(editor.document), item.id);
  const add = (text: string, thread = "") => {
    addComment(editor.document, { on: item.id, author, text, thread });
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
