import { canConnect } from "../document/capabilities";
import { drawingIssue } from "../document/ink";
import { isLink, type Item } from "../document/types";
import { resizedPanelContents } from "../document/panelResize";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";

export function checkedDrawingEndpoint(draft: Draft, id: string, line: number) {
  if (!canConnect(draft.items.get(id)!))
    throw new LanguageError("Connect a workspace object.", line);
  return id;
}

/** Final-state validation also covers existing links whose endpoint eligibility changed. */
export function checkDrawings(draft: Draft) {
  for (const item of draft.items.values()) {
    const problem = drawingIssue(item);
    if (problem) throw new LanguageError(`${item.id}: ${problem}`, 1);
    if (!isLink(item)) continue;
    for (const id of [item.from, item.to]) {
      const endpoint = draft.items.get(id);
      if (endpoint && !canConnect(endpoint))
        throw new LanguageError(`Remove connector ${item.id} before making ${id} markup.`, 1);
    }
  }
}

/** Draft edits use the same resize policy as pointer and numeric edits. */
export function reshapePanel(draft: Draft, before: Item | null, after: Item) {
  if (!before) return;
  for (const change of resizedPanelContents([...draft.items.values()], before, after, (item) =>
    draft.lookOf(item)
  )) {
    const item = draft.items.get(change.id)!;
    Object.assign(item, change.geometry);
    item.look = { ...item.look, ...change.look };
    draft.moved.add(item.id);
  }
}
