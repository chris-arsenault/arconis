import { useEffect, useRef, useState } from "react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { downloadFile } from "../files/download";
import { renderPng } from "../editor/pngExport";
import { pictureScope } from "../editor/layerView";

export type ExportFormat = "document" | "png";
interface ExportProps {
  session: RoomSession;
  editor: EditorController | null;
  onMessage: (message: string) => void;
}

async function exportPng({ session, editor, onMessage }: ExportProps, annotations: boolean) {
  if (!editor) return;
  const ids = pictureScope(session.document, editor.layers, editor.selectionClosure());
  if (!ids) {
    onMessage("Every layer with content is hidden.");
    return;
  }
  const png = await session.files.png(
    ids,
    () => renderPng(editor.graph, ids, session.document.list(), annotations),
    annotations
  );
  if (!png) {
    onMessage("Add something to the canvas first.");
    return;
  }
  downloadFile(session.document, new Uint8Array(png), "image/png", "png");
}

async function download(props: ExportProps, format: ExportFormat, annotations: boolean) {
  try {
    if (format === "png") await exportPng(props, annotations);
    else
      downloadFile(
        props.session.document,
        await props.session.files.canvas([], annotations),
        "text/plain",
        "arconis"
      );
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError"))
      props.onMessage(String(error));
  }
}

/** Export options apply to the download being made, rather than to the File menu or canvas. */
export function CanvasExport({
  format,
  onClose,
  ...props
}: Readonly<ExportProps & { format: ExportFormat; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null);
  const [annotations, setAnnotations] = useState(true);
  const title = format === "png" ? "Export PNG" : "Export document";
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="export-dialog" aria-labelledby="export-title" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void download(props, format, annotations);
          ref.current?.close();
        }}
      >
        <h2 id="export-title">{title}</h2>
        <p>
          {format === "png"
            ? "Download the selection, or the whole canvas when nothing is selected, as an editable PNG."
            : "Download the whole canvas as an editable Arconis document."}
        </p>
        <label
          className="export-annotations"
          data-hint-detail="Include pen, highlighter and other annotation strokes in this export."
        >
          <input
            type="checkbox"
            checked={annotations}
            onChange={(event) => setAnnotations(event.target.checked)}
          />
          Include canvas annotations
        </label>
        <p className="muted">
          Annotations are the pen and highlighter marks drawn over the canvas.
        </p>
        {props.session.lock.requiresPassword && (
          <p className="export-copy-note">
            Exports are readable copies without the room password. PNGs include editable canvas
            content.
          </p>
        )}
        <footer>
          <button
            type="button"
            data-hint-detail="Return to the canvas without downloading."
            onClick={() => ref.current?.close()}
          >
            Cancel
          </button>
          <button
            className="primary"
            data-hint-detail="Download this file with the selected export options."
          >
            {title}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
