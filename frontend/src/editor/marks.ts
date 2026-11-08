import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { listComments, openThreadCounts } from "../document/comments";
import { referenceCounts } from "../document/relations";
import { deckOf, isSlide } from "../document/slides";
import { hasHiddenDetail } from "./culling";

/** What surrounds a label: a slide's deck and number before it, signs after it. */
export interface Marks {
  before: string;
  after: string;
}
const NONE: Marks = { before: "", after: "" };

/**
 * Signs added to a label: hidden detail, references and open comments, and a slide's place in its
 * deck. They come from one pass per document change, because labels are read for every object at
 * every zoom step. `before` comes from peers and is escaped where the label is composed.
 */
export class LabelMarks {
  private marks = new Map<string, Marks>();

  constructor(
    private graph: Graph,
    private document: CanvasDocument
  ) {}

  text(cell: Cell): Marks {
    const detail = hasHiddenDetail(cell, this.graph.view.scale) ? "⊕" : "";
    const marks = this.marks.get(cell.id ?? "") ?? NONE;
    return { before: marks.before, after: [detail, marks.after].filter(Boolean).join(" ") };
  }

  /** Recounts, and redraws the objects whose signs changed. */
  refresh() {
    const items = this.document.list();
    const references = referenceCounts(items);
    const comments = openThreadCounts(listComments(this.document));
    const next = new Map<string, Marks>();
    for (const id of new Set([...references.keys(), ...comments.keys()])) {
      const parts = [
        references.has(id) ? `↗${references.get(id)}` : "",
        comments.has(id) ? `💬${comments.get(id)}` : "",
      ];
      next.set(id, { before: "", after: parts.filter(Boolean).join(" ") });
    }
    for (const slide of items.filter(isSlide))
      next.set(slide.id, {
        before: `${deckOf(slide)} · ${slide.slide ?? 0}`,
        after: next.get(slide.id)?.after ?? "",
      });
    const same = (a?: Marks, b?: Marks) => a?.before === b?.before && a?.after === b?.after;
    const changed = [...new Set([...this.marks.keys(), ...next.keys()])].filter(
      (id) => !same(this.marks.get(id), next.get(id))
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
