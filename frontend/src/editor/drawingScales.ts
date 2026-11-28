import type { CellState, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { compatibleUnit, distanceFactor, type Calibration } from "../document/units";

/** Resolve selection and pointer intent into the shared document's drawing coordinates. */
export class DrawingScales {
  private preferredUnit = "";

  constructor(
    private graph: Graph,
    private document: CanvasDocument
  ) {
    try {
      this.preferredUnit = localStorage.getItem("arconis:unit") ?? "";
    } catch {
      /* Session preference still works. */
    }
  }

  setUnit(unit: string) {
    this.preferredUnit = unit;
    try {
      localStorage.setItem("arconis:unit", unit);
    } catch {
      /* Session preference still works. */
    }
  }

  scope(holder: string | null) {
    if (holder !== null) return this.document.contentScale(holder);
    const cells = this.graph.getSelectionCells();
    return this.document.contentScale(cells.length === 1 ? (cells[0].id ?? "") : "");
  }

  holderAt(point: { x: number; y: number }) {
    const { scale, translate } = this.graph.view;
    const cell = this.graph.getCellAt(
      (point.x + translate.x) * scale,
      (point.y + translate.y) * scale,
      null,
      true,
      true,
      (state: CellState) =>
        !this.document.items.has(state.cell.id ?? "") || state.shape?.node?.style.display === "none"
    );
    return this.document.contentScale(cell?.id ?? "").owner;
  }

  unitsFor(calibration: Calibration | null) {
    return {
      factor: distanceFactor(calibration, this.preferredUnit),
      unit: compatibleUnit(calibration, this.preferredUnit),
    };
  }
  between(from: string, to: string) {
    const first = this.document.contentScale(from);
    const mixed = first.owner !== this.document.contentScale(to).owner;
    return { ...this.unitsFor(mixed ? null : first.calibration), owner: first.owner, mixed };
  }
}
