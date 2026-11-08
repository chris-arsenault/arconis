import { useEffect, useRef, useState } from "react";
import {
  EyeOff,
  Grid3x3,
  Keyboard,
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
  Waypoints,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { clampScale, zoomLabel } from "../editor/zoom";
import { changeFields } from "../editor/commands";
import { runCommand } from "../editor/registry";
import { shortcutLabel } from "../editor/shortcuts";
import { anythingInView } from "../editor/views";
import { FindBar } from "./FindBar";
import { FilterBar } from "./FilterBar";

/** Hidden items have nothing to click, so the one way back to them stays in view. */
function HiddenObjects({ editor }: Readonly<{ editor: EditorController }>) {
  const hidden = editor.document.list().filter((item) => item.hidden);
  if (!hidden.length) return null;
  const label = `Show ${hidden.length} hidden ${hidden.length === 1 ? "object" : "objects"}`;
  return (
    <button
      className="hidden-objects"
      aria-label={label}
      title={label}
      onClick={() =>
        changeFields(
          editor.document,
          hidden.map((item) => item.id),
          { hidden: undefined }
        )
      }
    >
      <EyeOff size={14} /> {hidden.length} hidden
    </button>
  );
}

/** A zoom typed as a percentage, applied on Enter or when the field is left. */
function ZoomInput({
  editor,
  initial,
  onDone,
}: Readonly<{ editor: EditorController; initial: string; onDone: () => void }>) {
  const [typing, setTyping] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const apply = () => {
    const percent = Number(typing);
    if (Number.isFinite(percent) && percent > 0) {
      editor.graph.zoomTo(clampScale(percent / 100), true);
      editor.emit();
    }
    onDone();
  };
  return (
    <input
      ref={input}
      className="zoom-readout"
      aria-label="Zoom percent"
      value={typing}
      onChange={(event) => setTyping(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter") apply();
        if (event.key === "Escape") onDone();
      }}
    />
  );
}

/** The zoom as a number people can read, and click to type one. */
function ZoomReadout({ editor }: Readonly<{ editor: EditorController }>) {
  const [typing, setTyping] = useState(false);
  const label = zoomLabel(editor.graph.view.scale);
  if (typing)
    return (
      <ZoomInput editor={editor} initial={label.replace("%", "")} onDone={() => setTyping(false)} />
    );
  return (
    <button
      className="zoom-readout"
      data-testid="zoom-level"
      title="Type a zoom"
      onClick={() => setTyping(true)}
    >
      {label}
    </button>
  );
}

/** When the view holds none of the canvas, one button brings it all back. */
function BackToContent({ editor }: Readonly<{ editor: EditorController }>) {
  const items = editor.document.list();
  if (!items.length || anythingInView(editor.graph, editor.element, items)) return null;
  return (
    <button className="back-to-content" onClick={() => runCommand(editor, "view.fit")}>
      <Scan size={14} /> Back to content
    </button>
  );
}

function ViewControls({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <div className="canvas-zoom">
      <button aria-label="Zoom out" onClick={() => editor.zoom(1 / 1.2)}>
        <Minus size={17} />
      </button>
      <ZoomReadout editor={editor} />
      <button aria-label="Zoom in" onClick={() => editor.zoom(1.2)}>
        <Plus size={17} />
      </button>
      <span className="zoom-divider" />
      <button aria-label="Fit canvas" title="Fit to contents" onClick={() => editor.fit()}>
        <Scan size={17} />
      </button>
      <button
        aria-label="Grid and snapping"
        title={editor.grid.visible ? "Hide grid and stop snapping" : "Show grid and snap to it"}
        aria-pressed={editor.grid.visible}
        onClick={() => {
          editor.grid.toggle();
          editor.emit();
        }}
      >
        <Grid3x3 size={17} />
      </button>
      <button
        aria-label="Reference lines"
        title={editor.referencesVisible ? "Hide reference lines" : "Show references as lines"}
        aria-pressed={editor.referencesVisible}
        onClick={() => editor.toggleReferences()}
      >
        <Waypoints size={17} />
      </button>
    </div>
  );
}

/** The controls floating over the canvas: history, view, hidden objects, find and the palette. */
export function CanvasHUD({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <>
      <HiddenObjects editor={editor} />
      <BackToContent editor={editor} />
      {editor.ui.find && <FindBar editor={editor} />}
      {editor.ui.filter && <FilterBar editor={editor} />}
      <div className="canvas-history">
        <button
          aria-label="Undo"
          title="Undo (Ctrl/⌘ Z)"
          disabled={!editor.document.undo.canUndo()}
          onClick={() => editor.document.undo.undo()}
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label="Redo"
          title="Redo (Ctrl/⌘ Shift Z)"
          disabled={!editor.document.undo.canRedo()}
          onClick={() => editor.document.undo.redo()}
        >
          <Redo2 size={18} />
        </button>
      </div>
      <ViewControls editor={editor} />
      <button
        className="help-button"
        aria-label="Commands and shortcuts"
        title={`Commands and shortcuts (${shortcutLabel({ key: "k", ctrl: true })})`}
        onClick={() => runCommand(editor, "view.palette")}
      >
        <Keyboard size={18} />
      </button>
    </>
  );
}
