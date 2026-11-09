import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Download, FileText, ImageDown, Upload, Shapes } from "lucide-react";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadFile } from "../files/download";
import { renderPng } from "../editor/pngExport";
import { RoomControls } from "./RoomControls";
import { ChangePassword } from "./PasswordGate";
import { AccountButton } from "./AccountControls";
import { SaveWorkspace } from "./SaveWorkspace";
import { Participants } from "./Presence";
import { useCompletedField } from "./useCompletedField";
import type { AccountStore } from "../account/accountStore";
import type { SavedCopy } from "../account/workspaceFile";

interface Props {
  session: RoomSession;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
  editor: EditorController | null;
  onMessage: (message: string) => void;
  onEditName: () => void;
  account: AccountStore | null;
  onOpenSaved: (copy: SavedCopy) => void;
}

export function WorkspaceHeader(props: Readonly<Props>) {
  const { session, name, onName, onCreate, onJoin } = props;
  useSyncExternalStore(session.subscribe, session.snapshot);
  const titleEdit = useCompletedField(session.document.actions);
  const [participants, setParticipants] = useState(false);
  const states = [...session.provider.awareness.getStates().values()] as Partial<{
    user: { name: string };
  }>[];
  const people = states.length;
  const names = states.map((state) => state.user?.name || "Guest").join(", ");
  return (
    <header className="topbar">
      <a className="brand compact" href="/" aria-label="Arconis home">
        <span className="brand-mark">
          <Shapes size={21} />
        </span>
        arconis
      </a>
      <span className="header-divider" />
      <div className="document-title">
        <input
          aria-label="Canvas title"
          value={session.document.title()}
          onChange={(event) => {
            titleEdit.start();
            session.document.rename(event.target.value);
          }}
          onBlur={titleEdit.finish}
          onKeyDown={titleEdit.keydown}
        />
      </div>
      <div className="topbar-actions">
        {props.account && <AccountButton account={props.account} onOpen={props.onOpenSaved} />}
        {props.account && (
          <SaveWorkspace
            account={props.account}
            room={session.saveable}
            onMessage={props.onMessage}
          />
        )}
        <ChangePassword session={session} />
        <DocumentActions session={session} editor={props.editor} onMessage={props.onMessage} />
        <button
          className="participant-badge"
          title={`In this room: ${names}. Click to see who is here or change your name.`}
          aria-label="Participants"
          aria-expanded={participants}
          onClick={() => setParticipants(!participants)}
        >
          <span>{name.slice(0, 1).toUpperCase()}</span>
          {people > 1 && <small>+{people - 1}</small>}
        </button>
        {participants && (
          <Participants
            editor={props.editor}
            session={session}
            onEditName={() => {
              setParticipants(false);
              props.onEditName();
            }}
            onClose={() => setParticipants(false)}
          />
        )}
        <RoomControls
          onCreate={onCreate}
          onJoin={onJoin}
          name={name}
          onName={onName}
          shareable={!isLocalRoom(session.id)}
        />
      </div>
    </header>
  );
}

type FileProps = Readonly<Pick<Props, "session" | "editor" | "onMessage">>;

async function loadFile({ session, editor, onMessage }: FileProps, file: File) {
  try {
    const count = await session.files.import(file);
    onMessage(`Imported ${count} objects.`);
    editor?.fit();
  } catch (error) {
    fileFailure(error, onMessage);
  }
}

async function exportPng({ session, editor, onMessage }: FileProps, includeMarkup: boolean) {
  if (!editor) return;
  try {
    const ids = editor.selectionClosure();
    const png = await session.files.png(
      ids,
      () => renderPng(editor.graph, ids, session.document.list(), includeMarkup),
      includeMarkup
    );
    if (!png) {
      onMessage("Add something to the canvas first.");
      return;
    }
    downloadFile(session.document, new Uint8Array(png), "image/png", "png");
  } catch (error) {
    fileFailure(error, onMessage);
  }
}

function fileFailure(error: unknown, onMessage: (text: string) => void) {
  if (error instanceof DOMException && error.name === "AbortError") return;
  onMessage(String(error));
}

async function exportCanvas({ session, onMessage }: FileProps, includeMarkup: boolean) {
  try {
    downloadFile(
      session.document,
      await session.files.canvas([], includeMarkup),
      "text/plain",
      "arconis"
    );
  } catch (error) {
    fileFailure(error, onMessage);
  }
}

/** Closes a header menu on a press outside it or on Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

/**
 * The file menu: export the canvas as a file or a picture, import one, and whether exports carry
 * the markup drawn over the canvas. The file chooser stays mounted so a dropped-in file works.
 */
function DocumentActions(props: FileProps) {
  const [includeMarkup, setIncludeMarkup] = useState(true);
  const [open, setOpen] = useState(false);
  const [close] = useState(() => () => setOpen(false));
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(menu, open, close);
  const load = (file: File) => loadFile(props, file);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="file-menu" ref={menu}>
      <button
        className="text-action file-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FileText size={16} /> File
      </button>
      {open && (
        <div className="file-menu-list" role="menu" aria-label="File">
          <button
            role="menuitem"
            onClick={run(() => void exportCanvas(props, includeMarkup))}
            title="Download the canvas as a file any room can import"
          >
            <Download size={15} /> Export document
          </button>
          <button
            role="menuitem"
            onClick={run(() => void exportPng(props, includeMarkup))}
            title="Download the selection or whole canvas as a PNG that can be loaded again"
          >
            <ImageDown size={15} /> Export PNG
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              input.current?.click();
            }}
          >
            <Upload size={15} /> Import document
          </button>
          <label className="export-markup">
            <input
              type="checkbox"
              checked={includeMarkup}
              onChange={(event) => setIncludeMarkup(event.target.checked)}
            />
            Include markup
          </label>
        </div>
      )}
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept=".arconis,application/json,.png,image/png"
        aria-label="Import file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void load(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
