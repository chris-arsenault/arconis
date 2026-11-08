import { useEffect, useLayoutEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, NotebookText, X } from "lucide-react";
import { groupThreads, listComments } from "../document/comments";
import type { EditorController } from "../editor/controller";

/** Keys that move through the deck. Space keeps its editor meaning and does nothing here. */
const STEPS: Record<string, number> = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };

/**
 * The stage over the canvas while presenting: a mask darkening everything outside the slide, which
 * also keeps pointer and wheel input from the canvas, and a bar to move, read notes and leave.
 */
export function PresenterStage({
  editor,
  notes,
  onToggleNotes,
}: Readonly<{ editor: EditorController; notes: boolean; onToggleNotes: () => void }>) {
  const { presenter } = editor;
  const slide = presenter.slide();
  const total = presenter.slides().length;
  const index = presenter.index();
  const mounted = useRef(false);
  // The chrome has just gone, or the notes changed the room left for the slide: fit it again.
  useLayoutEffect(() => {
    presenter.refit(!mounted.current);
    mounted.current = true;
  }, [presenter, notes]);
  useEffect(() => {
    const refit = () => presenter.refit(false);
    const keys = (event: KeyboardEvent) => {
      const step = STEPS[event.key];
      if (step) {
        event.preventDefault();
        presenter.go(step);
      } else if (event.key === "Escape") presenter.stop();
    };
    window.addEventListener("resize", refit);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("resize", refit);
      window.removeEventListener("keydown", keys);
    };
  }, [presenter]);
  // The deck emptied under the presenter, so there is nothing left to show.
  useEffect(() => {
    if (!slide) presenter.stop();
  }, [slide, presenter]);
  if (!slide) return null;
  return (
    <div className="presenter-stage" data-testid="presenter">
      <StageMask editor={editor} />
      <div className="presenter-bar" role="toolbar" aria-label="Presentation">
        <button aria-label="Previous slide" disabled={index <= 1} onClick={() => presenter.go(-1)}>
          <ChevronLeft size={18} />
        </button>
        <span data-testid="slide-position">
          {index} / {total}
        </span>
        <button aria-label="Next slide" disabled={index >= total} onClick={() => presenter.go(1)}>
          <ChevronRight size={18} />
        </button>
        <span className="presenter-divider" />
        <button
          aria-label="Speaker notes"
          title="Speaker notes"
          aria-pressed={notes}
          onClick={onToggleNotes}
        >
          <NotebookText size={17} />
        </button>
        <button
          aria-label="Leave presentation"
          title="Leave presentation (Escape)"
          onClick={() => presenter.stop()}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

/**
 * Darkens everything outside the shown slide's box. The box is placed from the view on every
 * render, so it follows the flight to a slide; its edge hides the slide's own outline.
 */
function StageMask({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  const slide = editor.presenter.slide();
  useLayoutEffect(() => {
    if (!slide || !ref.current) return;
    const { scale, translate } = editor.graph.view;
    const edge = 1;
    Object.assign(ref.current.style, {
      left: `${(slide.x + translate.x) * scale + edge}px`,
      top: `${(slide.y + translate.y) * scale + edge}px`,
      width: `${slide.width * scale - 2 * edge}px`,
      height: `${slide.height * scale - 2 * edge}px`,
    });
  });
  return <div ref={ref} className="presenter-mask" data-testid="presenter-mask" />;
}

/** The shown slide's comments, as the presenter's notes, beside the stage. */
export function PresenterNotes({ editor }: Readonly<{ editor: EditorController }>) {
  const slide = editor.presenter.slide();
  if (!slide) return null;
  const threads = groupThreads(listComments(editor.document), slide.id);
  return (
    <aside className="presenter-notes" aria-label="Speaker notes" data-testid="presenter-notes">
      <h3>{slide.name || "Notes"}</h3>
      {threads.length === 0 && <p className="presenter-empty">No comments on this slide.</p>}
      {threads.map(({ root, replies }) => (
        <div className="presenter-note" key={root.id}>
          {[root, ...replies].map((comment) => (
            <p key={comment.id}>{comment.text}</p>
          ))}
        </div>
      ))}
    </aside>
  );
}
