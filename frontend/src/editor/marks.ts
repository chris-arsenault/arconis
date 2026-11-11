import type { Cell, Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { branchNumbers, foldedBy } from "../document/relations";
import { deckOf, isSlide, isTemplate } from "../document/slides";
import { isBox, type Item, type Marker } from "../document/types";
import { hasHiddenDetail } from "./culling";

/** What surrounds a label: a slide's deck and number before it, signs after it. */
export interface Marks {
  before: string;
  after: string;
}
const NONE: Marks = { before: "", after: "" };

/** The shape each marker draws beside a label. */
export const MARKER_SIGNS: Record<Marker, string> = {
  star: "★",
  circle: "●",
  square: "■",
  triangle: "▲",
  diamond: "◆",
  hexagon: "⬢",
};

/** The signs an item's own fields add, before and after its name. */
function fieldMarks(item: Item, items: Item[]) {
  const before: string[] = [];
  const after: string[] = [];
  if (item.collapsed) {
    const folded = [...foldedBy(items, item.id)].filter((id) => {
      const inner = items.find((candidate) => candidate.id === id);
      return inner && isBox(inner) && !inner.onLine;
    });
    if (folded.length) after.push(`▸${folded.length}`);
  }
  return { before, after };
}

/** A slide's deck and number, or "template", before its name; nothing for other items. */
function slidePlace(item: Item) {
  if (!isSlide(item)) return "";
  const place = isTemplate(item) ? "template" : String(item.slide);
  return `${deckOf(item)} · ${place}`;
}

/**
 * Structural signs added to a label: hidden detail, folded contents and a slide's place in its
 * deck. Metadata is rendered separately as object chrome. Signs come from one pass per document
 * change, because labels are read for every object at every zoom step. Everything here is escaped
 * where the label is composed, since names and tags come from peers.
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
    const numbers = branchNumbers(items);
    const next = new Map<string, Marks>();
    for (const item of items) {
      const own = fieldMarks(item, items);
      const after = own.after;
      const before = [slidePlace(item), numbers.get(item.id) ?? "", ...own.before].filter(Boolean);
      if (before.length || after.length)
        next.set(item.id, { before: before.join(" "), after: after.join(" ") });
    }
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
