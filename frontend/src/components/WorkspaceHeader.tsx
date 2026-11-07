import { useRef } from "react";
import { Download, ImageDown, Upload, Shapes } from "lucide-react";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import {
  downloadDocument,
  downloadFile,
  importDocument,
  readDocumentFile,
  serializeDocument,
} from "../document/files";
import { embedCopy } from "../document/pngCopy";
import { renderPng } from "../editor/pngExport";
import { RoomControls } from "./RoomControls";
import { ChangePassword } from "./PasswordGate";
import { AccountButton } from "./AccountControls";
import { SaveWorkspace } from "./SaveWorkspace";
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
          onChange={(event) => session.document.rename(event.target.value)}
        />
      </div>
      <div className="topbar-actions">
        {props.account && <AccountButton account={props.account} onOpen={props.onOpenSaved} />}
        {props.account && (
          <SaveWorkspace account={props.account} session={session} onMessage={props.onMessage} />
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
    const content = await readDocumentFile(file);
    const count = importDocument(session.document, content, await session.prepareFile(content));
    onMessage(`Imported ${count} objects.`);
    editor?.fit();
    void session.uploadPictures();
  } catch (error) {
    onMessage(String(error));
  }
}

async function exportPng({ session, editor, onMessage }: FileProps) {
  if (!editor) return;
  try {
    const ids = editor.selectionClosure();
    const png = await renderPng(editor.graph, ids, session.document.list());
    if (!png) {
      onMessage("Add something to the canvas first.");
      return;
    }
    const copy = serializeDocument(session.document, ids, await session.portablePictures(ids));
    downloadFile(session.document, await embedCopy(png, copy), "image/png", "png");
  } catch (error) {
    onMessage(String(error));
  }
}

function DocumentActions(props: FileProps) {
  const { session } = props;
  const input = useRef<HTMLInputElement>(null);
  const load = (file: File) => loadFile(props, file);
  const exportPicture = () => exportPng(props);
  return (
    <>
      <button
        className="icon-button"
        title="Export document"
        aria-label="Export document"
        onClick={() => {
          void session
            .portablePictures()
            .then((pictures) => downloadDocument(session.document, pictures));
        }}
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
    </>
  );
}
