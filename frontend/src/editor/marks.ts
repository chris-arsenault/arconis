import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { listComments, openThreadCounts } from "../document/comments";
import { referenceCounts } from "../document/relations";
import { hasHiddenDetail } from "./culling";

/**
 * Signs added to a label: hidden detail, references and open comments. Counts come from one pass per
 * document change, because labels are read for every object at every zoom step.
 */
export class LabelMarks {
  private marks = new Map<string, string>();

  constructor(
    private graph: Graph,
    private document: CanvasDocument
  ) {}

  text(cell: Cell) {
    const detail = hasHiddenDetail(cell, this.graph.view.scale) ? "⊕" : "";
    return [detail, this.marks.get(cell.id ?? "") ?? ""].filter(Boolean).join(" ");
  }

  /** Recounts, and redraws the objects whose signs changed. */
  refresh() {
    const references = referenceCounts(this.document.list());
    const comments = openThreadCounts(listComments(this.document));
    const next = new Map<string, string>();
    for (const id of new Set([...references.keys(), ...comments.keys()])) {
      const parts = [
        references.has(id) ? `↗${references.get(id)}` : "",
        comments.has(id) ? `💬${comments.get(id)}` : "",
      ];
      next.set(id, parts.filter(Boolean).join(" "));
    }
    const changed = [...new Set([...this.marks.keys(), ...next.keys()])].filter(
      (id) => this.marks.get(id) !== next.get(id)
    );
    this.marks = next;
    if (!changed.length) return;
    const model = this.graph.getDataModel();
    changed.forEach((id) => {
      const cell = model.getCell(id);
      if (cell) this.graph.view.invalidate(cell, false, false);
    });
    this.graph.view.validate();
  }
}
