import { InternalEvent, type Cell, type Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isBox, typeLabel, type Item } from "../document/types";

const RESULT_LIMIT = 8;

/** The plain first line of a label, for naming an item in a list. */
export function itemName(item: Item) {
  const line = item.name.split("\n").find((text) => text.trim()) ?? "";
  return line.replaceAll(/[#*_`>[\]]/g, "").trim() || typeLabel(item);
}

/** How well a name answers a search: 0 starts with it, 1 holds it, -1 does not. */
function rank(name: string, words: string) {
  if (!words || name.includes(words)) return name.startsWith(words) && words ? 0 : 1;
  return -1;
}

/** Objects a search names, best first: names that start with the words, then names holding them. */
export function relateCandidates(items: Item[], from: Item, query: string) {
  const words = query.trim().toLowerCase();
  return items
    .filter((item) => item.id !== from.id && isBox(item) && !item.onLine && item.name.trim())
    .map((item) => {
      const name = itemName(item).toLowerCase();
      return { item, name, rank: rank(name, words) };
    })
    .filter((candidate) => candidate.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, RESULT_LIMIT)
    .map(({ item }) => item);
}

/**
 * Reference lines stay hidden unless switched on, except those of the selection: selecting an
 * object shows what it refers to and what refers to it.
 */
export class SelectionReferences {
  private ids = new Set<string>();
  private references = new Set<string>();

  /** `allShown` says whether this person switched every reference line on. */
  constructor(private readonly allShown: () => boolean) {}

  /** Whether a reference cell shows: all are switched on, or it belongs to the selection. */
  shows = (cell: Cell) => {
    if (this.allShown() || this.references.has(cell.id ?? "")) return true;
    return [cell.source?.id, cell.target?.id].some((id) => id && this.ids.has(id));
  };

  /** Follows the graph's selection from now on. */
  watch(graph: Graph, document: CanvasDocument) {
    graph
      .getSelectionModel()
      .addListener(InternalEvent.CHANGE, () =>
        this.update(graph, document.list(), this.allShown())
      );
  }

  /** Follows a selection change, redrawing the references that appear or disappear. */
  update(graph: Graph, items: Item[], allShown: boolean) {
    const before = this.references;
    this.ids = new Set(graph.getSelectionCells().map((cell) => cell.id ?? ""));
    this.references = new Set(
      items
        .filter(
          (item) => item.type === "reference" && (this.ids.has(item.from) || this.ids.has(item.to))
        )
        .map((item) => item.id)
    );
    if (allShown || (!before.size && !this.references.size)) return;
    const model = graph.getDataModel();
    for (const id of new Set([...before, ...this.references])) {
      const cell = model.getCell(id);
      if (cell) graph.view.invalidate(cell, false, false);
    }
    graph.view.validate();
  }
}
