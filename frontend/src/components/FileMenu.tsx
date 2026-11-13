import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Download, FileText, ImageDown, Upload, FilePlus2, FolderOpen, House } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadFile } from "../files/download";
import { renderPng } from "../editor/pngExport";
import { pictureScope } from "../editor/layerView";
import { IMPORT_ACCEPT, importForeignFile } from "../editor/importFile";
import { RoomDialog } from "./RoomControls";
import { DeckExportItem } from "./DeckExports";

interface FileProps {
  session: RoomSession;
  editor: EditorController | null;
  onMessage: (message: string) => void;
}
type FileMenuProps = FileProps &
  Readonly<{
    onCreate: () => void;
    onJoin: (id: string) => void;
    onLeave: () => void;
    name: string;
    onName: (name: string) => void;
  }>;
type MenuRunner = (action: () => void) => () => void;

async function loadFile({ session, editor, onMessage }: FileProps, file: File) {
  try {
    // A diagram or outline from another tool becomes objects; anything else is a canvas file.
    const foreign = editor ? await importForeignFile(editor, session, file) : null;
    onMessage(foreign ?? `Imported ${await session.files.import(file)} objects.`);
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
  onJoin,
}: Readonly<{
  props: FileMenuProps;
  includeMarkup: boolean;
  onMarkup: (include: boolean) => void;
  run: (action: () => void) => () => void;
  onImport: () => void;
  onJoin: () => void;
}>) {
  return (
    <>
      <CanvasNavigation props={props} run={run} onJoin={onJoin} />
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
      <DeckExportItem editor={props.editor} run={run} />
      <button
        role="menuitem"
        onClick={onImport}
        data-hint-detail="Add a canvas file, an Arconis PNG, or a Mermaid, D2, PlantUML, draw.io or OPML file to this canvas."
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
export function FileMenu(props: FileMenuProps) {
  const [includeMarkup, setIncludeMarkup] = useState(true);
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [closeJoin] = useState(() => () => setJoining(false));
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
        data-hint-detail="Create or open a canvas, return home, import or export files."
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
            onJoin={() => setJoining(true)}
          />
        </div>
      )}
      {joining && (
        <RoomDialog
          mode="join"
          name={props.name}
          onName={props.onName}
          onJoin={props.onJoin}
          onClose={closeJoin}
        />
      )}
      <FilePicker input={input} props={props} />
    </div>
  );
}

function CanvasNavigation({
  props,
  run,
  onJoin,
}: Readonly<{ props: FileMenuProps; run: MenuRunner; onJoin: () => void }>) {
  return (
    <>
      {" "}
      <button
        role="menuitem"
        aria-label="New canvas"
        onClick={run(props.onCreate)}
        data-hint-detail="Open a separate, empty canvas. This canvas stays saved on this device."
      >
        <FilePlus2 size={15} />
        <span>
          New canvas<small className="menu-description">A separate canvas; this one is kept</small>
        </span>
      </button>
      <button
        role="menuitem"
        onClick={run(onJoin)}
        data-hint-detail="Open another canvas by its room link or code."
      >
        <FolderOpen size={15} /> Join room…
      </button>
      <button
        role="menuitem"
        onClick={run(props.onLeave)}
        data-hint-detail="Return to your canvases on the home screen."
      >
        <House size={15} /> Back to my canvases
      </button>
      <hr />
    </>
  );
}

function FilePicker({
  input,
  props,
}: Readonly<{ input: RefObject<HTMLInputElement | null>; props: FileProps }>) {
  return (
    <input
      ref={input}
      className="visually-hidden"
      type="file"
      tabIndex={-1}
      accept={IMPORT_ACCEPT}
      aria-label="Import file"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(props, file);
        event.target.value = "";
      }}
    />
  );
}
