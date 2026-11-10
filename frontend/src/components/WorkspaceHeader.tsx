import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Download, FileText, ImageDown, Upload, Shapes } from "lucide-react";
import { HelpButton } from "./HelpSurfaces";
import { isLocalRoom, type RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadFile } from "../files/download";
import { renderPng } from "../editor/pngExport";
import { pictureScope } from "../editor/layerView";
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

const HOME_HELP = "Go to the Arconis start page and leave this canvas.";

export function WorkspaceHeader(props: Readonly<Props>) {
  const { session, name, onName, onCreate, onJoin } = props;
  useSyncExternalStore(session.subscribe, session.snapshot);
  return (
    <header className="topbar">
      <a className="brand compact" href="/" aria-label="Arconis home" data-hint-detail={HOME_HELP}>
        <span className="brand-mark">
          <Shapes size={21} />
        </span>
        arconis
      </a>
      <span className="header-divider" />
      <div className="document-title" data-help-id="canvas-title">
        <CanvasTitle key={session.id} document={session.document} />
      </div>
      <div className="topbar-actions">
        {props.account && (
          <AccountButton account={props.account} onOpen={props.onOpenSaved} onJoin={props.onJoin} />
        )}
        {props.account && (
          <SaveWorkspace
            account={props.account}
            room={session.saveable}
            onMessage={props.onMessage}
          />
        )}
        <ChangePassword session={session} />
        {props.account && props.editor && (
          <ReusableSections account={props.account} session={session} editor={props.editor} />
        )}
        <DocumentActions session={session} editor={props.editor} onMessage={props.onMessage} />
        {props.editor && <Settings editor={props.editor} />}
        {props.editor && <HelpButton editor={props.editor} />}
        {props.editor && (
          <Feedback session={session} editor={props.editor} name={name} account={props.account} />
        )}
        <ParticipantsControl {...props} />
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
    const ids = pictureScope(session.document, editor.layers, editor.selectionClosure());
    if (!ids) {
      onMessage("Every layer with content is hidden.");
      return;
    }
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

function ExportCopyNote({ locked }: Readonly<{ locked: boolean }>) {
  return locked ? (
    <p className="export-copy-note">
      Exports are readable copies without the room password. PNGs include editable canvas content.
    </p>
  ) : null;
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
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [ref, open, close]);
}

function navigateFileMenu(
  event: ReactKeyboardEvent<HTMLDivElement>,
  close: () => void,
  trigger: HTMLButtonElement | null
) {
  if (event.key === "Tab") {
    close();
    trigger?.focus();
    return;
  }
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
  const current = items.indexOf(document.activeElement as HTMLElement);
  const step = event.key === "ArrowUp" ? -1 : 1;
  let next = (current + step + items.length) % items.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = items.length - 1;
  items[next]?.focus();
}

function FileMenuItems({
  props,
  includeMarkup,
  onMarkup,
  run,
  onImport,
}: Readonly<{
  props: FileProps;
  includeMarkup: boolean;
  onMarkup: (include: boolean) => void;
  run: (action: () => void) => () => void;
  onImport: () => void;
}>) {
  return (
    <>
      <ExportCopyNote locked={props.session.lock.requiresPassword} />
      <button
        role="menuitem"
        onClick={run(() => void exportCanvas(props, includeMarkup))}
        data-hint="Export document"
        data-hint-detail="Download the whole canvas as a readable file any room can import."
      >
        <Download size={15} /> Export document
      </button>
      <button
        role="menuitem"
        onClick={run(() => void exportPng(props, includeMarkup))}
        data-hint="Export PNG"
        data-hint-detail="Download the selection, or the whole canvas, as a picture with editable source inside."
      >
        <ImageDown size={15} /> Export PNG
      </button>
      <button
        role="menuitem"
        onClick={onImport}
        data-hint-detail="Add the objects from a canvas file or Arconis PNG to this canvas."
      >
        <Upload size={15} /> Import document
      </button>
      <label
        className="export-markup"
        data-hint-detail="Choose whether exports carry the markup drawn over the canvas."
      >
        <input
          type="checkbox"
          role="menuitemcheckbox"
          aria-checked={includeMarkup}
          checked={includeMarkup}
          onChange={(event) => onMarkup(event.target.checked)}
        />
        Include markup
      </label>
    </>
  );
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
  const trigger = useRef<HTMLButtonElement>(null);
  const edge = useRef("first");
  useDismiss(menu, open, close);
  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    if (items?.length) items[edge.current === "last" ? items.length - 1 : 0].focus();
  }, [open]);
  const run = (action: () => void) => () => {
    setOpen(false);
    trigger.current?.focus();
    action();
  };
  const importFile = () => {
    setOpen(false);
    trigger.current?.focus();
    input.current?.click();
  };
  return (
    <div className="file-menu" ref={menu} data-help-id="file" data-help-topic="files">
      <button
        ref={trigger}
        className="text-action file-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-hint-detail="Export this canvas as a file or picture, or import one into it."
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          event.preventDefault();
          edge.current = event.key === "ArrowUp" ? "last" : "first";
          setOpen(true);
        }}
      >
        <FileText size={16} /> File
      </button>
      {open && (
        <div
          className="file-menu-list"
          role="menu"
          tabIndex={-1}
          aria-label="File"
          onKeyDown={(event) => navigateFileMenu(event, close, trigger.current)}
        >
          <FileMenuItems
            props={props}
            includeMarkup={includeMarkup}
            onMarkup={setIncludeMarkup}
            run={run}
            onImport={importFile}
          />
        </div>
      )}
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        tabIndex={-1}
        accept=".arconis,application/json,.png,image/png"
        aria-label="Import file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(props, file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
