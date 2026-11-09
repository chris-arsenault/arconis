import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { showComments } from "../editor/registry";
import {
  addComment,
  deleteComment,
  groupThreads,
  listComments,
  setResolved,
} from "../document/comments";
import { CommentControls } from "./CommentControls";
import { typeLabel } from "../document/types";
import { isSlide } from "../document/slides";

/** Where the modal sits: above a box's top edge, or at a line's label; in canvas-area pixels. */
function anchorFor(editor: EditorController, id: string) {
  const cell = editor.graph.getDataModel().getCell(id);
  const state = cell ? editor.graph.view.getState(cell) : null;
  if (!state) return null;
  if (cell!.isEdge()) {
    const label = state.text?.boundingBox ?? state;
    return { x: label.getCenterX(), top: label.y, bottom: label.y + label.height };
  }
  return { x: state.getCenterX(), top: state.y, bottom: state.y + state.height };
}

/**
 * An object's comments, opened on purpose, in a modal above the object at the highest level:
 * the discussion sits where its object is. It follows the object through pan and zoom, stays in
 * the window, and closes on Escape, a click outside or opening another object's comments.
 */
export function CommentModal({
  editor,
  author,
}: Readonly<{ editor: EditorController; author: string }>) {
  const id = editor.ui.comments;
  const ref = useRef<HTMLDivElement>(null);
  const item = id ? editor.document.get(id) : null;
  useLayoutEffect(() => {
    if (!ref.current || !id) return;
    const anchor = anchorFor(editor, id);
    if (!anchor) return;
    const area = editor.element.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.x - box.width / 2, area.width - box.width - 8));
    const above = anchor.top - box.height - 10;
    const top = above >= 8 ? above : Math.min(anchor.bottom + 10, area.height - box.height - 8);
    Object.assign(ref.current.style, { left: `${left}px`, top: `${Math.max(8, top)}px` });
  });
  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") showComments(editor, null);
    };
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target))
        showComments(editor, null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [editor, id]);
  if (!id || !item) return null;
  const canvas = editor.document;
  const heading = isSlide(item) ? "Speaker notes" : "Comments";
  return (
    <div
      ref={ref}
      className="comment-modal"
      role="dialog"
      aria-label={`${heading} on ${item.name || typeLabel(item)}`}
      data-testid="comment-modal"
    >
      <header>
        <strong>
          {isSlide(item) && "Speaker notes · "}
          {item.name.split("\n")[0] || typeLabel(item)}
        </strong>
        <button
          className="icon-action"
          aria-label={`Close ${heading.toLowerCase()}`}
          onClick={() => showComments(editor, null)}
        >
          <X size={14} />
        </button>
      </header>
      <CommentControls
        speakerNotes={isSlide(item)}
        threads={groupThreads(listComments(canvas), item.id)}
        onAdd={(text, thread = "") => addComment(canvas, { on: item.id, author, text, thread })}
        onDelete={(commentId) => deleteComment(canvas, commentId)}
        onResolve={(commentId, resolved) => setResolved(canvas, commentId, resolved)}
      />
    </div>
  );
}
