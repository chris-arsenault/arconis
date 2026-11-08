import { canConnect } from "../document/capabilities";
import { drawingIssue } from "../document/ink";
import { selectedItems } from "../document/relations";
import { drawingTransform, transformObjects } from "../document/transform";
import { isBox, isLink, type Item } from "../document/types";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";

/** Final-state validation also covers existing links whose endpoint eligibility changed. */
export function checkDrawings(draft: Draft) {
  for (const item of draft.items.values()) {
    const problem = drawingIssue(item, draft.items.get(item.inside));
    if (problem) throw new LanguageError(`${item.id}: ${problem}`, 1);
    if (!isLink(item)) continue;
    for (const id of [item.from, item.to]) {
      const endpoint = draft.items.get(id);
      if (endpoint && !canConnect(endpoint, draft.items.get(endpoint.inside)))
        throw new LanguageError(
          `Remove connector ${item.id} before making ${id} markup or Drawing contents.`,
          1
        );
    }
  }
}

/** Draft edits use the same collective transform as the UI, before placement moves the holder. */
export function reshapeDrawing(draft: Draft, before: Item | null, after: Item) {
  if (!before) return;
  const transform = drawingTransform(before, after, before.look, draft.lookOf(after));
  if (transform.scaleX === 1 && transform.scaleY === 1 && transform.angle === 0) return;
  const items = selectedItems([...draft.items.values()], [after.id]).filter(
    (item) => item.id !== after.id
  );
  const values = transformObjects(items, transform, (item) => draft.lookOf(item));
  for (const item of items) {
    const { rotation, gradientAngle, ...geometry } = values.get(item.id)!;
    Object.assign(item, geometry);
    if (isBox(item)) item.look = { ...item.look, rotation };
    if (gradientAngle !== undefined) item.look = { ...item.look, gradientAngle };
    draft.moved.add(item.id);
  }
}
