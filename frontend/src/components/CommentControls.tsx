import { useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { MAX_COMMENT_LENGTH, type CanvasComment } from "../document/comments";
import { Section } from "./ConnectionControls";

function CommentBody({
  comment,
  onDelete,
}: Readonly<{ comment: CanvasComment; onDelete: (id: string) => void }>) {
  return (
    <div className="comment">
      <div className="comment-meta">
        <strong>{comment.author}</strong>
        <time>{new Date(comment.time).toLocaleString()}</time>
        <button
          className="icon-action"
          aria-label={`Delete comment by ${comment.author}`}
          title="Delete"
          onClick={() => onDelete(comment.id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <p>{comment.text}</p>
    </div>
  );
}

/** A multi-line comment box: Enter sends, Shift Enter breaks a line, as speaker notes need. */
function CommentBox({
  label,
  placeholder,
  onSubmit,
}: Readonly<{ label: string; placeholder: string; onSubmit: (text: string) => void }>) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };
  return (
    <form
      className="comment-box"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        aria-label={label}
        placeholder={placeholder}
        value={text}
        rows={Math.min(8, text.split("\n").length)}
        maxLength={MAX_COMMENT_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          send();
        }}
      />
    </form>
  );
}

/** Threads on the selected item, including lines. */
export function CommentControls({
  threads,
  onAdd,
  onDelete,
  onResolve,
}: Readonly<{
  threads: { root: CanvasComment; replies: CanvasComment[] }[];
  onAdd: (text: string, thread?: string) => void;
  onDelete: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
}>) {
  return (
    <Section title="Comments">
      {threads.map(({ root, replies }) => (
        <div
          key={root.id}
          className={root.resolved ? "comment-thread resolved" : "comment-thread"}
          data-testid="comment-thread"
        >
          <CommentBody comment={root} onDelete={onDelete} />
          {replies.map((reply) => (
            <CommentBody key={reply.id} comment={reply} onDelete={onDelete} />
          ))}
          <div className="comment-actions">
            <CommentBox
              label={`Reply to ${root.author}`}
              placeholder="Reply"
              onSubmit={(text) => onAdd(text, root.id)}
            />
            <button
              className="icon-action"
              aria-label={root.resolved ? "Reopen thread" : "Resolve thread"}
              title={root.resolved ? "Reopen" : "Resolve"}
              onClick={() => onResolve(root.id, !root.resolved)}
            >
              {root.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
            </button>
          </div>
        </div>
      ))}
      <CommentBox
        label="Add a comment"
        placeholder="Add a comment"
        onSubmit={(text) => onAdd(text)}
      />
    </Section>
  );
}
