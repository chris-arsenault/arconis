import { useRef, useState } from "react";
import { Download, ImageDown, Upload, Shapes } from "lucide-react";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadFile } from "../files/download";
import { renderPng } from "../editor/pngExport";
import { RoomControls } from "./RoomControls";
import { ChangePassword } from "./PasswordGate";
import { AccountButton } from "./AccountControls";
import { SaveWorkspace } from "./SaveWorkspace";
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
  const titleEdit = useCompletedField(session.document.actions);
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
          title={`In this room: ${names}. Click to change your name.`}
          aria-label="Change your name"
          onClick={props.onEditName}
        >
          <span>{name.slice(0, 1).toUpperCase()}</span>
          {people > 1 && <small>+{people - 1}</small>}
        </button>
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

function DocumentActions(props: FileProps) {
  const [includeMarkup, setIncludeMarkup] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const load = (file: File) => loadFile(props, file);
  const exportPicture = () => exportPng(props, includeMarkup);
  return (
    <>
      <button
        className="icon-button"
        title="Export document"
        aria-label="Export document"
        onClick={() => void exportCanvas(props, includeMarkup)}
      >
        <Download size={18} />
      </button>
      <button
        className="icon-button"
        title="Export the selection or whole canvas as a PNG that can be loaded again"
        aria-label="Export PNG"
        onClick={() => void exportPicture()}
      >
        <ImageDown size={18} />
      </button>
      <button
        className="icon-button"
        title="Import document"
        aria-label="Import document"
        onClick={() => input.current?.click()}
      >
        <Upload size={18} />
      </button>
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
      <label className="export-markup">
        <input
          type="checkbox"
          checked={includeMarkup}
          onChange={(event) => setIncludeMarkup(event.target.checked)}
        />
        Include markup
      </label>
    </>
  );
}
