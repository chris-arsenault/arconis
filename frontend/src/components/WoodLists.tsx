import { useEffect, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { cutList } from "../document/woodworking";
import { hardwareList } from "../document/woodHardware";

export function WoodCutList({ editor }: Readonly<{ editor: EditorController }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-haspopup="dialog"
        data-hint-detail="Review the stock, dimensions and quantities to cut for this assembly."
        onClick={() => setOpen(true)}
      >
        <ClipboardList size={17} /> Cut list
      </button>
      {open && <CutListDialog editor={editor} onClose={() => setOpen(false)} />}
    </>
  );
}

function CutListDialog({
  editor,
  onClose,
}: Readonly<{ editor: EditorController; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const rows = cutList(editor.document.wood.parts());
  return (
    <dialog
      ref={dialog}
      className="wood-cut-list"
      aria-labelledby="cut-list-title"
      onClose={onClose}
    >
      <h2 id="cut-list-title">Cut list</h2>
      {rows.length ? (
        <>
          <p>
            {rows.length} cut {rows.length === 1 ? "type" : "types"}
          </p>
          <ul>
            {rows.map((row) => (
              <li key={row.pieces[0].id}>
                <details>
                  <summary data-hint-detail="Show the pieces for this cut and how each length was determined.">
                    <strong>
                      {row.pieces.length} × {row.length}
                    </strong>{" "}
                    · {row.stock}
                    <small className="cut-section">Width × thickness · {row.section}</small>
                  </summary>
                  {row.pieces.map((piece) => (
                    <div key={piece.id}>
                      {piece.name} · {piece.basis}
                    </div>
                  ))}
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Add a board or panel to list its finished cuts.</p>
      )}
      <footer>
        <button onClick={() => dialog.current?.close()}>Close</button>
      </footer>
    </dialog>
  );
}

export function HardwareList({ editor }: Readonly<{ editor: EditorController }>) {
  const rows = hardwareList(editor.document.wood.parts());
  return (
    <details className="wood-hardware-list">
      <summary data-hint-detail="Count each physical fitting once across all views.">
        Hardware list ({rows.reduce((n, row) => n + row.quantity, 0)})
      </summary>
      {rows.length ? (
        <ul>
          {rows.map((row, index) => (
            <li key={index}>
              {row.quantity} × {row.label}
              {row.details && " · " + row.details}
            </li>
          ))}
        </ul>
      ) : (
        <p>Add fasteners or brackets to list the hardware for this assembly.</p>
      )}
    </details>
  );
}
