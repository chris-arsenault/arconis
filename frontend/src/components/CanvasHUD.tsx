import { useEffect, useRef, useState } from "react";
import {
  Grid3x3,
  Keyboard,
  Minus,
  Plus,
  Redo2,
  Search,
  Scan,
  Undo2,
  Waypoints,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { zoomAt, zoomLabel, ZOOM_STEP } from "../editor/zoom";
import { runCommand } from "../editor/registry";
import { showFind } from "../editor/ui";
import { shortcutLabel } from "../editor/shortcuts";
import { anythingInView } from "../editor/views";
import { FindBar } from "./FindBar";
import { ScaleControls } from "./ScaleControls";
import "./discovery.css";

/** A precise magnification, applied on Enter or when the field is left. */
function ZoomInput({
  editor,
  initial,
  onDone,
}: Readonly<{ editor: EditorController; initial: string; onDone: () => void }>) {
  const [typing, setTyping] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => input.current?.focus(), []);
  const apply = () => {
    if (finished.current) return;
    finished.current = true;
    const scale = Number(typing.replace(/[×x]$/, "").trim());
    if (Number.isFinite(scale) && scale > 0) {
      zoomAt(editor.graph, scale);
      editor.emit();
    }
    onDone();
  };
  return (
    <input
      ref={input}
      className="zoom-readout"
      aria-label="Zoom multiplier"
      data-hint-detail="Type a magnification such as 0.5 or 2 and press Enter; Escape cancels."
      value={typing}
      onChange={(event) => setTyping(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter") apply();
        if (event.key === "Escape") {
          finished.current = true;
          onDone();
        }
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
      <ZoomInput
        editor={editor}
        initial={String(editor.graph.view.scale)}
        onDone={() => setTyping(false)}
      />
    );
  return (
    <button
      className="zoom-readout"
      data-testid="zoom-level"
      data-hint="Type a zoom"
      data-hint-detail="Type an exact magnification for your view only."
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
    <button
      className="back-to-content"
      data-hint-detail="Your view shows none of the canvas; bring everything back into view."
      onClick={() => runCommand(editor, "view.fit")}
    >
      <Scan size={14} /> Back to content
    </button>
  );
}

function ViewControls({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <div
      className="canvas-zoom"
      data-help-id="view-controls"
      data-help-topic="editing#pan-zoom-and-grid"
    >
      <button
        aria-label="Zoom out"
        data-hint-detail="Show more of the canvas; pinching or Ctrl/⌘ scrolling also zooms."
        onClick={() => editor.zoom(1 / ZOOM_STEP)}
      >
        <Minus size={17} />
      </button>
      <ZoomReadout editor={editor} />
      <button
        aria-label="Zoom in"
        data-hint-detail="Look closer at the canvas; pinching or Ctrl/⌘ scrolling also zooms."
        onClick={() => editor.zoom(ZOOM_STEP)}
      >
        <Plus size={17} />
      </button>
      <span className="zoom-divider" />
      <button
        aria-label="Fit canvas"
        data-hint="Fit to contents"
        data-hint-detail="Zoom and scroll so everything on the canvas is in view."
        onClick={() => editor.fit()}
      >
        <Scan size={17} />
      </button>
      <button
        aria-label="Grid and snapping"
        data-hint-detail="A grid helps line objects up; while it shows, moved objects snap to it."
        data-hint={editor.grid.visible ? "Hide grid and stop snapping" : "Show grid and snap to it"}
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
        data-hint={editor.referencesVisible ? "Hide reference lines" : "Show references as lines"}
        data-hint-detail="Draw a line for each reference between objects, in your view only."
        aria-pressed={editor.referencesVisible}
        onClick={() => editor.toggleReferences()}
      >
        <Waypoints size={17} />
      </button>
    </div>
  );
}

/** The controls floating over the canvas: history, view, find and the palette. */
export function CanvasHUD({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <>
      <BackToContent editor={editor} />
      <div
        className="canvas-discovery"
        data-help-id="find"
        data-help-topic="editing#find-on-canvas"
      >
        {editor.ui.find || editor.ui.filter ? (
          <FindBar editor={editor} />
        ) : (
          <button
            className="canvas-discovery-button"
            data-hint="Find and filter (Ctrl/⌘ F)"
            data-hint-detail="Find text, or highlight objects by tag, marker and task, in your view only."
            onClick={() => showFind(editor, true)}
          >
            <Search size={16} /> Find and filter
          </button>
        )}
      </div>
      <div className="canvas-history" data-help-id="history" data-help-topic="editing#history">
        <button
          aria-label="Undo"
          data-hint="Undo (Ctrl/⌘ Z)"
          data-hint-detail="Take back your last change. Other people's changes stay."
          disabled={!editor.document.undo.canUndo()}
          onClick={() => editor.document.undo.undo()}
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label="Redo"
          data-hint="Redo (Ctrl/⌘ Shift Z)"
          data-hint-detail="Bring back the change you last undid."
          disabled={!editor.document.undo.canRedo()}
          onClick={() => editor.document.undo.redo()}
        >
          <Redo2 size={18} />
        </button>
      </div>
      <ViewControls editor={editor} />
      <ScaleControls editor={editor} />
      <button
        className="help-button"
        data-help-id="palette"
        data-help-topic="commands"
        aria-label="Commands and shortcuts"
        data-hint={`Commands and shortcuts (${shortcutLabel({ key: "k", ctrl: true })})`}
        data-hint-detail="Search every command by name and see its keyboard shortcut."
        onClick={() => runCommand(editor, "view.palette")}
      >
        <Keyboard size={18} />
      </button>
    </>
  );
}
