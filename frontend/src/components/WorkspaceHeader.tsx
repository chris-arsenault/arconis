import { useRef, useState, useSyncExternalStore } from "react";
import { Shapes } from "lucide-react";
import { HelpButton } from "./HelpSurfaces";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { RoomControls } from "./RoomControls";
import { ChangePassword } from "./PasswordGate";
import { AccountButton } from "./AccountControls";
import { SaveWorkspace } from "./SaveWorkspace";
import { Participants } from "./Presence";
import type { CanvasDocument } from "../document/canvasDocument";
import type { AccountStore } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";
import { Settings } from "./Settings";
import { Feedback } from "./Feedback";
import { ReusableSections } from "./ReusableSections";
import { FileMenu } from "./FileMenu";

interface Props {
  session: RoomSession;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onLeave: () => void;
  onJoin: (id: string) => void;
  editor: EditorController | null;
  onMessage: (message: string) => void;
  onEditName: () => void;
  account: AccountStore | null;
  onOpenSaved: (copy: SavedCopy) => void;
}

const HOME_HELP = "Go to the Arconis start page and leave this canvas.";
const subscribeEmpty = () => () => {};

export function WorkspaceHeader(props: Readonly<Props>) {
  const { session, name, onName, onJoin } = props;
  useSyncExternalStore(session.subscribe, session.snapshot);
  const accountStatus = useSyncExternalStore(
    props.account?.subscribe ?? subscribeEmpty,
    () => props.account?.status ?? "out"
  );
  return (
    <header className="topbar">
      <a className="brand compact" href="/" aria-label="Arconis home" data-hint-detail={HOME_HELP}>
        <span className="brand-mark">
          <Shapes size={21} />
        </span>
        arconis
      </a>
      <FileMenu {...props} />
      <span className="header-divider" />
      <div className="document-title" data-help-id="canvas-title">
        <CanvasTitle key={session.id} document={session.document} />
      </div>
      <div className="topbar-actions">
        <div className="topbar-group" aria-label="Canvas storage">
          {props.account && (
            <SaveWorkspace
              account={props.account}
              room={session.saveable}
              onMessage={props.onMessage}
            />
          )}
          <ChangePassword session={session} />
          {props.account && props.editor && accountStatus === "in" && (
            <ReusableSections account={props.account} session={session} editor={props.editor} />
          )}
        </div>
        <WorkspaceTools {...props} />
        <div className="topbar-group" aria-label="Collaboration and account">
          <ParticipantsControl {...props} />
          <RoomControls
            onJoin={onJoin}
            name={name}
            onName={onName}
            shareable={!isLocalRoom(session.id)}
          />
          {props.account && (
            <AccountButton
              account={props.account}
              onOpen={props.onOpenSaved}
              onJoin={props.onJoin}
            />
          )}
        </div>
      </div>
    </header>
  );
}

/** Who is in the room: the badge names them as information and opens the participant list. */
function ParticipantsControl({ session, name, editor, onEditName }: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const states = [...session.provider.awareness.getStates().values()] as Partial<{
    user: { name: string };
  }>[];
  const names = states.map((state) => state.user?.name || "Guest").join(", ");
  return (
    <>
      <button
        className="participant-badge"
        data-help-id="participants"
        data-help-topic="collaboration"
        data-hint-detail="See who is here, follow someone or change your name."
        data-tip={`In this room: ${names}`}
        aria-label="Participants"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{name.slice(0, 1).toUpperCase()}</span>
        {states.length > 1 && <small>+{states.length - 1}</small>}
      </button>
      {open && (
        <Participants
          editor={editor}
          session={session}
          onEditName={() => {
            setOpen(false);
            onEditName();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The display fallback never replaces an empty title while someone is editing it. */
function CanvasTitle({ document }: Readonly<{ document: CanvasDocument }>) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (draft === null) return;
    const title = draft || "Untitled canvas";
    if (!cancelled.current && title !== document.title()) {
      document.undo.stopCapturing();
      document.rename(title);
      document.undo.stopCapturing();
    }
    cancelled.current = false;
    setDraft(null);
  };
  return (
    <input
      aria-label="Canvas title"
      data-hint-detail="Rename this canvas for everyone in the room; Escape keeps the old name."
      value={draft ?? document.title()}
      onChange={(event) => {
        cancelled.current = false;
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || !["Enter", "Escape"].includes(event.key)) return;
        cancelled.current = event.key === "Escape";
        event.currentTarget.blur();
      }}
    />
  );
}

function WorkspaceTools(props: Readonly<Props>) {
  const { editor, session, name, account } = props;
  if (!editor) return null;
  return (
    <div className="topbar-group" aria-label="Workspace tools">
      <Settings editor={editor} />
      <HelpButton editor={editor} />
      <Feedback session={session} editor={editor} name={name} account={account} />
    </div>
  );
}
