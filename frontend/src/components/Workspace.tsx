import { useState, useSyncExternalStore } from "react";
import { Undo2, Redo2, Minus, Plus, Scan, CheckCircle2, WifiOff, Keyboard } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { Canvas, InlineEditor, Cursors } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { Inspector } from "./Inspector";
import { Outline } from "./Outline";
import { WorkspaceHeader } from "./WorkspaceHeader";

const subscribeEmpty = () => () => {};
const snapshotEmpty = () => 0;
interface Props {
  session: RoomSession;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
}

export function Workspace(props: Readonly<Props>) {
  const { session } = props;
  useSyncExternalStore(session.subscribe, session.snapshot);
  const [editor, setEditor] = useState<EditorController | null>(null);
  useSyncExternalStore(editor?.subscribe || subscribeEmpty, editor?.snapshot || snapshotEmpty);
  const [mode, setMode] = useState("diagram");
  const [message, setMessage] = useState("");
  return (
    <div className="workspace">
      <WorkspaceHeader {...props} editor={editor} onMessage={setMessage} />
      <div className="workspace-body">
        {editor && <Outline editor={editor} mode={mode} onMode={setMode} />}
        <CanvasArea session={session} editor={editor} mode={mode} onEditor={setEditor} />
        {editor && <Inspector editor={editor} />}
      </div>
      <ConnectionStatus session={session} />
      {message && (
        <div className="toast" role="status">
          {message}
          <button onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function CanvasArea({
  session,
  editor,
  mode,
  onEditor,
}: Readonly<{
  session: RoomSession;
  editor: EditorController | null;
  mode: string;
  onEditor: (editor: EditorController | null) => void;
}>) {
  return (
    <main className="canvas-area">
      <Canvas session={session} onEditor={onEditor} />
      {editor && (
        <>
          <Toolbar editor={editor} mode={mode} />
          <InlineEditor editor={editor} />
          <Cursors editor={editor} session={session} />
          <CanvasHUD editor={editor} />
        </>
      )}
      {editor && session.document.list().length === 0 && (
        <div className="canvas-hint">
          <span className="eyebrow">A FRESH PERSPECTIVE</span>
          <h2>Start anywhere.</h2>
          <p>Pick a tool, click the canvas, and let your ideas take shape.</p>
          <button onClick={() => editor.add("sticky")}>
            Add your first sticky note <Plus size={16} />
          </button>
        </div>
      )}
    </main>
  );
}

function ConnectionStatus({ session }: Readonly<{ session: RoomSession }>) {
  const labels = {
    online: "Connected",
    connecting: "Connecting…",
    offline: "Offline",
    error: "Connection error",
  };
  return (
    <footer className="statusbar">
      <span className={`connection-status ${session.state}`}>
        {session.state === "online" ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
        <span data-testid="connection-status">{labels[session.state]}</span>
      </span>
      <span>{session.detail || "Changes sync with connected participants"}</span>
      <span className="local-status">
        {session.stored ? "Local copy enabled" : "Opening local copy"} ·{" "}
        {session.document.list().length} objects
      </span>
    </footer>
  );
}

function CanvasHUD({ editor }: Readonly<{ editor: EditorController }>) {
  const [help, setHelp] = useState(false);
  return (
    <>
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
      <div className="canvas-zoom">
        <button aria-label="Zoom out" onClick={() => editor.zoom(1 / 1.2)}>
          <Minus size={17} />
        </button>
        <span data-testid="zoom-level">{Math.round(editor.graph.view.scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => editor.zoom(1.2)}>
          <Plus size={17} />
        </button>
        <span className="zoom-divider" />
        <button aria-label="Fit canvas" title="Fit to contents" onClick={() => editor.fit()}>
          <Scan size={17} />
        </button>
      </div>
      <button
        className="help-button"
        aria-label="Keyboard shortcuts"
        onClick={() => setHelp(!help)}
      >
        <Keyboard size={18} />
      </button>
      {help && (
        <div className="keyboard-help">
          <strong>A few useful shortcuts</strong>
          <p>V select · N note · R rectangle · D decision · P draw</p>
          <p>Space pan · scroll zoom · Shift-click multi-select</p>
          <p>Ctrl/⌘ Z undo · Ctrl/⌘ D duplicate · Ctrl/⌘ G group</p>
          <p>Delete remove · Double-click edit · Escape finish</p>
        </div>
      )}
    </>
  );
}
