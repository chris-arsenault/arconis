import { useRef } from "react";
import { Download, Upload, Shapes } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadDocument, importDocument } from "../document/files";
import { RoomControls } from "./RoomControls";

interface Props {
  session: RoomSession;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  onJoin: (id: string) => void;
  editor: EditorController | null;
  onMessage: (message: string) => void;
}

export function WorkspaceHeader(props: Readonly<Props>) {
  const { session, name, onName, onCreate, onJoin } = props;
  const people = session.provider.awareness.getStates().size;
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
        <span>SHARED WORKSPACE</span>
      </div>
      <div className="topbar-actions">
        <DocumentActions session={session} editor={props.editor} onMessage={props.onMessage} />
        <span className="participant-badge" title={`${people} participants`}>
          <span>{name.slice(0, 1).toUpperCase()}</span>
          {people > 1 && <small>+{people - 1}</small>}
        </span>
        <RoomControls onCreate={onCreate} onJoin={onJoin} name={name} onName={onName} />
      </div>
    </header>
  );
}

function DocumentActions({
  session,
  editor,
  onMessage,
}: Readonly<Pick<Props, "session" | "editor" | "onMessage">>) {
  const input = useRef<HTMLInputElement>(null);
  const load = async (file: File) => {
    try {
      const count = importDocument(session.document, await file.text());
      onMessage(`Imported ${count} objects.`);
      editor?.fit();
    } catch (error) {
      onMessage(String(error));
    }
  };
  return (
    <>
      <button
        className="icon-button"
        title="Export document"
        aria-label="Export document"
        onClick={() => downloadDocument(session.document)}
      >
        <Download size={18} />
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
        accept=".arconis,application/json"
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
