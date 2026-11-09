import { useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { MAX_COMMENT_LENGTH, type CanvasComment } from "../document/comments";

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
          data-hint="Delete"
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
  focusOnMount = false,
  onSubmit,
}: Readonly<{
  label: string;
  placeholder: string;
  focusOnMount?: boolean;
  onSubmit: (text: string) => void;
}>) {
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
        ref={(element) => {
          if (focusOnMount) element?.focus();
        }}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        rows={Math.min(8, text.split("\n").length)}
        maxLength={MAX_COMMENT_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          send();
        }}
      />
    </form>
  );
}

type Thread = { root: CanvasComment; replies: CanvasComment[] };

function ThreadView({
  thread: { root, replies },
  onAdd,
  onDelete,
  onResolve,
}: Readonly<{
  thread: Thread;
  onAdd: (text: string, thread?: string) => void;
  onDelete: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
}>) {
  return (
    <div
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
          data-hint={root.resolved ? "Reopen" : "Resolve"}
          onClick={() => onResolve(root.id, !root.resolved)}
        >
          {root.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
        </button>
      </div>
    </div>
  );
}

/** Threads on an item, open ones first and resolved ones folded behind a count. */
export function CommentControls({
  threads,
  onAdd,
  onDelete,
  onResolve,
  speakerNotes = false,
}: Readonly<{
  threads: Thread[];
  speakerNotes?: boolean;
  onAdd: (text: string, thread?: string) => void;
  onDelete: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
}>) {
  const [showResolved, setShowResolved] = useState(false);
  const open = threads.filter((thread) => !thread.root.resolved);
  const resolved = threads.filter((thread) => thread.root.resolved);
  const actions = { onAdd, onDelete, onResolve };
  return (
    <div className="comment-list">
      {open.map((thread) => (
        <ThreadView key={thread.root.id} thread={thread} {...actions} />
      ))}
      {resolved.length > 0 && (
        <button
          className="text-action resolved-toggle"
          aria-expanded={showResolved}
          onClick={() => setShowResolved(!showResolved)}
        >
          {resolved.length} resolved
        </button>
      )}
      {showResolved &&
        resolved.map((thread) => <ThreadView key={thread.root.id} thread={thread} {...actions} />)}
      <CommentBox
        label={speakerNotes ? "Add speaker notes" : "Add a comment"}
        placeholder={speakerNotes ? "Add speaker notes" : "Add a comment"}
        focusOnMount={!threads.length}
        onSubmit={(text) => onAdd(text)}
      />
    </div>
  );
}
