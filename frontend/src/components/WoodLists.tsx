import type { EditorController } from "../editor/controller";
import { cutList } from "../document/woodworking";
import { hardwareList } from "../document/woodHardware";

export function WoodCutList({ editor }: Readonly<{ editor: EditorController }>) {
  const rows = cutList(editor.document.wood.parts());
  return (
    <details className="wood-cut-list">
      <summary>Cut list ({rows.length})</summary>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.name}</strong> · {row.stock} · Qty {row.quantity}
              <div>{row.dimensions}</div>
              <small>Length · {row.basis}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>Add a board or panel to list its finished cuts.</p>
      )}
    </details>
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
