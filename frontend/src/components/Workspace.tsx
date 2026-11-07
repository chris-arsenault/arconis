import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Undo2,
  Redo2,
  Minus,
  Plus,
  Scan,
  CheckCircle2,
  WifiOff,
  Keyboard,
  Grid3x3,
} from "lucide-react";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { zoomLabel } from "../editor/zoom";
import { Canvas, InlineEditor, Cursors } from "./Canvas";
import { Inspector } from "./Inspector";
import { LeftRail } from "./LeftRail";
import { SelectionFrame } from "./SelectionFrame";
import { WorkspaceHeader } from "./WorkspaceHeader";

const subscribeEmpty = () => () => {};
const snapshotEmpty = () => 0;
interface Props {
  session: RoomSession;
  name: string;
  askName: boolean;
  newRoom: boolean;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
}

export function Workspace(props: Readonly<Props>) {
  const { session, name, onName, newRoom } = props;
  useSyncExternalStore(session.subscribe, session.snapshot);
  const [editor, setEditor] = useState<EditorController | null>(null);
  useSyncExternalStore(editor?.subscribe || subscribeEmpty, editor?.snapshot || snapshotEmpty);
  const [message, setMessage] = useState("");
  const [namePrompt, setNamePrompt] = useState(props.askName);
  const closeNamePrompt = () => {
    onName(name.trim() || "Guest");
    setNamePrompt(false);
  };
  return (
    <div className="workspace">
      <WorkspaceHeader
        {...props}
        editor={editor}
        onMessage={setMessage}
        onEditName={() => setNamePrompt(true)}
      />
      <div className="workspace-body">
        {editor && <LeftRail editor={editor} />}
        <CanvasArea session={session} editor={editor} newRoom={newRoom} onEditor={setEditor}>
          {namePrompt && <NamePrompt name={name} onName={onName} onClose={closeNamePrompt} />}
        </CanvasArea>
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

function NamePrompt({
  name,
  onName,
  onClose,
}: Readonly<{ name: string; onName: (name: string) => void; onClose: () => void }>) {
  return (
    <form
      className="name-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <label>
        Your name
        <input
          aria-label="Your name in this room"
          value={name}
          maxLength={40}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      <button type="submit" className="primary">
        Done
      </button>
    </form>
  );
}

function CanvasArea({
  session,
  editor,
  newRoom,
  onEditor,
  children,
}: Readonly<{
  session: RoomSession;
  editor: EditorController | null;
  newRoom: boolean;
  onEditor: (editor: EditorController | null) => void;
  children: ReactNode;
}>) {
  return (
    <main className="canvas-area">
      <Canvas session={session} onEditor={onEditor} />
      {editor && (
        <>
          <InlineEditor editor={editor} />
          <SelectionFrame editor={editor} />
          <Cursors editor={editor} session={session} />
          <CanvasHUD editor={editor} />
        </>
      )}
      {editor && session.document.list().length === 0 && (
        <EmptyCanvasHint editor={editor} session={session} newRoom={newRoom} />
      )}
      {children}
    </main>
  );
}

function EmptyCanvasHint({
  editor,
  session,
  newRoom,
}: Readonly<{ editor: EditorController; session: RoomSession; newRoom: boolean }>) {
  const { sync } = session.provider;
  if (!newRoom && (sync === "searching" || sync === "receiving"))
    return (
      <div className="canvas-hint" data-testid="canvas-hint">
        <h2>{sync === "receiving" ? "Receiving this canvas…" : "Looking for this canvas…"}</h2>
        <p>Asking anyone in this room for their copy.</p>
      </div>
    );
  return (
    <div className="canvas-hint" data-testid="canvas-hint">
      <h2>This canvas is empty</h2>
      <p>Click a stencil on the left, then click the canvas. You can also drag a stencil here.</p>
      {!newRoom && sync === "alone" && (
        <p>
          Nobody else is online. If this room already has content, it appears when someone holding a
          copy returns.
        </p>
      )}
      <button
        onClick={() => {
          editor.edit(editor.add("sticky"), true);
        }}
      >
        <Plus size={14} /> Add a sticky note
      </button>
    </div>
  );
}

function syncDescription(session: RoomSession) {
  if (isLocalRoom(session.id)) return "Nothing in this room leaves this browser";
  if (session.detail && session.state !== "online") return session.detail;
  const others = session.provider.awareness.getStates().size - 1;
  switch (session.provider.sync) {
    case "searching":
      return "Looking for participants…";
    case "receiving":
      return "Receiving the canvas…";
    case "synced":
      if (others > 0)
        return `In sync with ${others} ${others === 1 ? "participant" : "participants"}`;
      return "Nobody else is online; edits are saved on this device";
    case "alone":
      return "Nobody else is online; edits are saved on this device";
    default:
      return "";
  }
}

function ConnectionStatus({ session }: Readonly<{ session: RoomSession }>) {
  const labels = {
    online: "Connected",
    connecting: "Connecting…",
    offline: "Offline",
    error: "Connection error",
    starting: "Starting collaboration…",
    stopped: "Collaboration off",
    limit: "Collaboration off until next month",
  };
  return (
    <footer className="statusbar">
      <span className={`connection-status ${session.state}`} title={session.detail}>
        {session.state === "online" ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
        <span data-testid="connection-status">
          {isLocalRoom(session.id) ? "On this device only" : labels[session.state]}
        </span>
      </span>
      {session.canStartCollaboration && (
        <button type="button" className="start-collaboration" onClick={session.startCollaboration}>
          Start collaboration
        </button>
      )}
      <span data-testid="sync-status">{syncDescription(session)}</span>
      <span className="local-status">
        {session.stored ? "Local copy enabled" : "Opening local copy"} ·{" "}
        <span data-testid="object-count">{session.document.list().length}</span> objects
      </span>
      <a href="/licenses.txt" target="_blank" rel="noreferrer">
        Licenses
      </a>
      <a href="/third-party-icons.txt" target="_blank" rel="noreferrer">
        Icon terms
      </a>
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
        <span data-testid="zoom-level">{zoomLabel(editor.graph.view.scale)}</span>
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
          <p>Ctrl/⌘ Z undo · Ctrl/⌘ D duplicate · Ctrl/⌘ G group · ] front · [ back</p>
          <p>Delete remove · Double-click edit · Escape finish</p>
        </div>
      )}
    </>
  );
}
