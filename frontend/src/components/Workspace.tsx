import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Plus, CheckCircle2, WifiOff } from "lucide-react";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { CommandPalette } from "./CommandPalette";
import { PasteAs } from "./PasteAs";
import { DeckChooser } from "./DeckExports";
import { CaptureBox } from "./CaptureBox";
import { PresenceOverlays } from "./Presence";
import { ContextMenu } from "./ContextMenu";
import { QuickCreate } from "./QuickCreate";
import { RelatePicker, TagPopover } from "./SelectionPopovers";
import { Measure, ResizeFeedback } from "./Measure";
import { DistanceMeasure } from "./DistanceMeasure";
import { Announcer } from "./Announcer";
import { CommentModal } from "./CommentModal";
import { CanvasHUD } from "./CanvasHUD";
import { Canvas, InlineEditor, Cursors } from "./Canvas";
import { DockToggle, RightDock } from "./RightDock";
import { MarkupBar } from "./MarkupBar";
import { PasswordGate } from "./PasswordGate";
import { LeftRail } from "./LeftRail";
import { SelectionFrame } from "./SelectionFrame";
import { GradientDirection } from "./GradientDirection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { PresenterNotes, PresenterStage } from "./Presenter";
import type { AccountStore } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { useNarrowLayout } from "./useNarrowLayout";
import { ContextHelp } from "./ContextHelp";
import { HelpSurfaces } from "./HelpSurfaces";
import { TextOverflow } from "./TextOverflow";
import { ObjectMetadata } from "./ObjectMetadata";

const subscribeEmpty = () => () => {};
interface Props {
  session: RoomSession;
  name: string;
  askName: boolean;
  newRoom: boolean;
  signedIn: boolean;
  account: AccountStore | null;
  onOpenSaved: (copy: SavedCopy) => void;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
  onLeave: () => void;
}

/** The room's editor as it arrives, and whether it is presenting, re-rendering as either changes. */
function useEditor() {
  const [editor, setEditor] = useState<EditorController | null>(null);
  const presenting = useSyncExternalStore(
    editor?.subscribe || subscribeEmpty,
    () => editor?.presenter.active ?? false
  );
  return { editor, setEditor, presenting };
}

export function Workspace(props: Readonly<Props>) {
  const { session, name, onName, newRoom } = props;
  const { editor, setEditor, presenting } = useEditor();
  const [message, setMessage] = useState("");
  // Every edit made here names this person as the item's last editor.
  useEffect(() => {
    session.document.setAuthor(name.trim() || "Guest");
  }, [session, name]);
  const [namePrompt, setNamePrompt] = useState(props.askName);
  const [notes, setNotes] = useState(false);
  const closeNamePrompt = () => {
    onName(name.trim() || "Guest");
    setNamePrompt(false);
  };
  const prompt =
    namePrompt && !props.signedIn && !presenting ? (
      <NamePrompt name={name} onName={onName} onClose={closeNamePrompt} />
    ) : null;
  return (
    <div className={presenting ? "workspace presenting" : "workspace"}>
      <ContextHelp />
      <PasswordGate session={session} onCancel={props.onLeave} />
      {!presenting && (
        <WorkspaceHeader
          {...props}
          editor={editor}
          onMessage={setMessage}
          onEditName={() => setNamePrompt(true)}
        />
      )}
      <WorkspaceBody
        session={session}
        editor={editor}
        newRoom={newRoom}
        onEditor={setEditor}
        presenting={presenting}
        notes={notes}
        onToggleNotes={() => setNotes(!notes)}
        author={props.name}
      >
        {prompt}
      </WorkspaceBody>
      {!presenting && <ConnectionStatus session={session} />}
      {message && (
        <div className="toast" role="status">
          {message}
          <button data-hint-detail="Hide this message." onClick={() => setMessage("")}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

type BodyProps = Readonly<{
  session: RoomSession;
  editor: EditorController | null;
  newRoom: boolean;
  onEditor: (editor: EditorController | null) => void;
  presenting: boolean;
  notes: boolean;
  onToggleNotes: () => void;
  author: string;
  children: ReactNode;
}>;

/**
 * The rails around the canvas. Presenting shows the canvas alone with the notes beside it; the
 * canvas keeps its place in the tree either way, so the editor lives on.
 */
function WorkspaceBody({ children, ...props }: BodyProps) {
  const { editor, presenting } = props;
  const narrow = useNarrowLayout();
  const [panel, setPanel] = useState<"tools" | "properties" | null>(null);
  const expandTools = useCallback((open: boolean) => setPanel(open ? "tools" : null), []);
  useSyncExternalStore(editor?.subscribe ?? subscribeEmpty, () =>
    Boolean(editor?.selected().length)
  );
  return (
    <div className="workspace-body">
      {editor &&
        !presenting &&
        (narrow ? (
          <LeftRail
            editor={editor}
            mode="compact"
            expanded={panel === "tools"}
            onExpand={expandTools}
          />
        ) : (
          <LeftRail editor={editor} mode="wide" />
        ))}
      <CanvasArea {...props}>{children}</CanvasArea>
      <PropertyPanel
        {...props}
        narrow={narrow}
        open={panel === "properties"}
        onToggle={() => setPanel(panel === "properties" ? null : "properties")}
      />
    </div>
  );
}

function PropertyPanel({
  editor,
  presenting,
  notes,
  onToggleNotes,
  narrow,
  open,
  onToggle,
}: Omit<BodyProps, "children"> &
  Readonly<{ narrow: boolean; open: boolean; onToggle: () => void }>) {
  if (!editor) return null;
  if (presenting) return notes ? <PresenterNotes editor={editor} onClose={onToggleNotes} /> : null;
  return (
    <>
      {narrow && (
        <DockToggle selection={editor.selected().length > 0} open={open} onToggle={onToggle} />
      )}
      {(!narrow || open) && <RightDock editor={editor} />}
    </>
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
      <label data-hint-detail="The name other people in the room see for you and your edits.">
        Your name
        <input
          aria-label="Your name in this room"
          value={name}
          maxLength={40}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="primary"
        data-hint-detail="Keep this name; an empty one becomes Guest."
      >
        Done
      </button>
    </form>
  );
}

/** Everything drawn over the canvas while editing: handles, cursors, the HUD and open dialogs. */
function EditingOverlays({
  editor,
  session,
  author,
}: Readonly<{ editor: EditorController; session: RoomSession; author: string }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  useSyncExternalStore(editor.subscribeView, editor.viewSnapshot);
  return (
    <>
      <ObjectMetadata editor={editor} />
      <QuickCreate editor={editor} />
      <InlineEditor editor={editor} />
      <SelectionFrame editor={editor} />
      <GradientDirection editor={editor} />
      <Cursors editor={editor} session={session} />
      <CanvasHUD editor={editor} />
      <MarkupBar editor={editor} />
      <TextOverflow editor={editor} />
      <Measure editor={editor} />
      <ResizeFeedback editor={editor} />
      <DistanceMeasure editor={editor} />
      <Announcer editor={editor} />
      {editor.ui.palette && <CommandPalette editor={editor} />}
      {editor.ui.pasteAs && <PasteAs editor={editor} />}
      {editor.ui.deckExport && <DeckChooser editor={editor} />}
      {editor.ui.capture && <CaptureBox editor={editor} />}
      <PresenceOverlays editor={editor} session={session} />
      {editor.ui.menu && <ContextMenu editor={editor} />}
      {editor.ui.comments && <CommentModal editor={editor} author={author} />}
      {editor.ui.tagging && <TagPopover editor={editor} />}
      {editor.ui.relating && <RelatePicker editor={editor} />}
      <HelpSurfaces editor={editor} />
    </>
  );
}

function CanvasArea({
  session,
  editor,
  newRoom,
  onEditor,
  presenting,
  notes,
  onToggleNotes,
  author,
  children,
}: Readonly<{
  session: RoomSession;
  editor: EditorController | null;
  newRoom: boolean;
  onEditor: (editor: EditorController | null) => void;
  presenting: boolean;
  notes: boolean;
  onToggleNotes: () => void;
  author: string;
  children: ReactNode;
}>) {
  useSyncExternalStore(session.subscribe, () => session.document.list().length);
  return (
    <main className="canvas-area">
      <Canvas session={session} onEditor={onEditor} />
      {editor && !presenting && (
        <EditingOverlays editor={editor} session={session} author={author} />
      )}
      {editor && presenting && (
        <PresenterStage editor={editor} notes={notes} onToggleNotes={onToggleNotes} />
      )}
      {editor && !presenting && session.document.list().length === 0 && (
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
  useSyncExternalStore(session.subscribe, session.snapshot);
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
        data-hint-detail="Place a sticky note on the canvas and start typing in it."
        onClick={() => {
          editor.edit(editor.add("note"), true);
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
  useSyncExternalStore(session.subscribe, session.snapshot);
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
      <span
        className={`connection-status ${session.state}`}
        data-tip={session.detail || syncDescription(session)}
      >
        {session.state === "online" ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
        <span data-testid="connection-status">
          {isLocalRoom(session.id) ? "On this device only" : labels[session.state]}
        </span>
      </span>
      {session.canStartCollaboration && (
        <button
          type="button"
          className="start-collaboration"
          data-hint-detail="Turn the relay back on so people in this room edit together live."
          onClick={session.startCollaboration}
        >
          Start collaboration
        </button>
      )}
      <span data-testid="sync-status">{session.notice || syncDescription(session)}</span>
      <span className="local-status">
        {session.stored ? "Local copy enabled" : "Opening local copy"} ·{" "}
        <span data-testid="object-count">{session.document.list().length}</span> objects
      </span>
      <a
        href="/licenses.txt"
        target="_blank"
        rel="noreferrer"
        data-hint-detail="Open the licenses of the software Arconis is built with, in a new tab."
      >
        Licenses
      </a>
      <a
        href="/third-party-icons.txt"
        target="_blank"
        rel="noreferrer"
        data-hint-detail="Open the terms for the vendor architecture icons, in a new tab."
      >
        Icon terms
      </a>
      <a
        href="/third-party-fonts.txt"
        target="_blank"
        rel="noreferrer"
        data-hint-detail="Open the licenses of the bundled fonts, in a new tab."
      >
        Font terms
      </a>
    </footer>
  );
}
