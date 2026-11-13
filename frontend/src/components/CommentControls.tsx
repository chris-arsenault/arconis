import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MessageSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import { MAX_COMMENT_LENGTH, type CanvasComment } from "../document/comments";

function CommentBody({
  comment,
  onDelete,
  onResolve,
}: Readonly<{
  comment: CanvasComment;
  onDelete: (id: string) => void;
  onResolve: ((id: string, resolved: boolean) => void) | null;
}>) {
  return (
    <div className="comment-message">
      <div className="comment-meta">
        <div className="comment-author">
          <strong>{comment.author}</strong>
          <time
            dateTime={new Date(comment.time).toISOString()}
            data-tip={new Date(comment.time).toLocaleString()}
          >
            {new Date(comment.time).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
            {" · "}
            {new Date(comment.time).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
        <div className="comment-message-actions">
          {onResolve && (
            <button
              className="comment-resolve"
              aria-label={comment.resolved ? "Reopen thread" : "Resolve thread"}
              data-hint={comment.resolved ? "Reopen" : "Resolve"}
              data-hint-detail="Resolved threads fold away under a count for everyone; reopening brings one back."
              onClick={() => onResolve(comment.id, !comment.resolved)}
            >
              {comment.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
              {comment.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          <button
            className="icon-action"
            aria-label={`Delete comment by ${comment.author}`}
            data-hint="Delete comment"
            data-hint-detail="Deleting a thread's first comment also removes its replies."
            onClick={() => onDelete(comment.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p>{comment.text}</p>
    </div>
  );
}

/** A multi-line comment box: Enter sends, Shift Enter breaks a line, as speaker notes need. */
function CommentBox({
  label,
  placeholder,
  focusOnMount,
  onCancel,
  onSubmit,
}: Readonly<{
  label: string;
  placeholder: string;
  focusOnMount: boolean;
  onCancel: (() => void) | null;
  onSubmit: (text: string) => void;
}>) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
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
        ref={ref}
        aria-label={label}
        placeholder={placeholder}
        data-hint-detail="Enter posts it for everyone in the room; Shift Enter starts a new line."
        value={text}
        rows={Math.min(6, Math.max(2, text.split("\n").length))}
        maxLength={MAX_COMMENT_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          send();
        }}
      />
      <div className="comment-compose-actions">
        {onCancel && (
          <button
            type="button"
            data-hint-detail="Close the reply box and discard what you typed."
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="primary"
          disabled={!text.trim()}
          aria-label={label.startsWith("Reply") ? "Send reply" : "Post comment"}
          data-hint-detail="Post this for everyone in the room to read."
        >
          <Send size={13} /> {label.startsWith("Reply") ? "Reply" : "Post"}
        </button>
      </div>
    </form>
  );
}

type Thread = { root: CanvasComment; replies: CanvasComment[] };

function EmptyDiscussion({
  resolved,
  speakerNotes,
}: Readonly<{ resolved: boolean; speakerNotes: boolean }>) {
  let title = speakerNotes ? "No speaker notes yet" : "Start a discussion";
  if (resolved) title = "All discussions resolved";
  return (
    <div className="comment-empty">
      <MessageSquare size={22} />
      <strong>{title}</strong>
      <span>
        {speakerNotes
          ? "Keep your talking points with this slide."
          : "Ask a question or leave feedback on this object."}
      </span>
    </div>
  );
}

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
      <CommentBody comment={root} onDelete={onDelete} onResolve={onResolve} />
      {replies.length > 0 && (
        <div className="comment-replies">
          {replies.map((reply) => (
            <CommentBody key={reply.id} comment={reply} onDelete={onDelete} onResolve={null} />
          ))}
        </div>
      )}
      <ThreadReply root={root} replyCount={replies.length} onAdd={onAdd} />
    </div>
  );
}

function ThreadReply({
  root,
  replyCount,
  onAdd,
}: Readonly<{
  root: CanvasComment;
  replyCount: number;
  onAdd: (text: string, thread?: string) => void;
}>) {
  const [replying, setReplying] = useState(false);
  if (root.resolved) return null;
  return (
    <>
      {!replying && (
        <button
          className="comment-reply-action"
          aria-label={`Reply to thread by ${root.author}`}
          data-hint-detail="Open a box to answer in this thread."
          onClick={() => setReplying(true)}
        >
          Reply{replyCount > 0 && ` (${replyCount})`}
        </button>
      )}
      {replying && (
        <CommentBox
          label={`Reply to ${root.author}`}
          placeholder="Write a reply…"
          focusOnMount
          onCancel={() => setReplying(false)}
          onSubmit={(text) => {
            onAdd(text, root.id);
            setReplying(false);
          }}
        />
      )}
    </>
  );
}

/** Threads on an item, open ones first and resolved ones folded behind a count. */
export function CommentControls({
  threads,
  onAdd,
  onDelete,
  onResolve,
  speakerNotes,
}: Readonly<{
  threads: Thread[];
  speakerNotes: boolean;
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
      <div className="comment-discussions">
        {!open.length && (
          <EmptyDiscussion resolved={resolved.length > 0} speakerNotes={speakerNotes} />
        )}
        {open.map((thread) => (
          <ThreadView key={thread.root.id} thread={thread} {...actions} />
        ))}
        {resolved.length > 0 && (
          <button
            className="text-action resolved-toggle"
            aria-expanded={showResolved}
            data-hint-detail="Show or hide the threads already marked resolved; this changes your view only."
            onClick={() => setShowResolved(!showResolved)}
          >
            <ChevronDown size={13} /> {resolved.length} resolved
          </button>
        )}
        {showResolved &&
          resolved.map((thread) => (
            <ThreadView key={thread.root.id} thread={thread} {...actions} />
          ))}
      </div>
      <div className="comment-new">
        <CommentBox
          label={speakerNotes ? "Add speaker notes" : "Add a comment"}
          placeholder={speakerNotes ? "Add speaker notes" : "Add a comment"}
          focusOnMount
          onCancel={null}
          onSubmit={(text) => onAdd(text)}
        />
      </div>
    </div>
  );
}
