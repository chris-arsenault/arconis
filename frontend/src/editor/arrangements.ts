import type { CanvasDocument } from "../document/canvasDocument";
import { movedWithContents } from "../document/relations";
import { LOCAL, isArranged, isBox, type Item } from "../document/types";
import { arrangedLayout } from "../document/arrangement";
import { authoredLook } from "../document/appearance";

/** Moves smaller than this are rounding, not a change worth writing. */
const SETTLED = 1e-6;

/** Reflows arranged frames after each of this person's edits. Returns a function that stops it. */
export function keepArranged(document: CanvasDocument) {
  let reflowing = false;
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin !== LOCAL || reflowing) return;
    reflowing = true;
    try {
      reflowArrangements(document);
    } finally {
      reflowing = false;
    }
  };
  document.doc.on("update", onUpdate);
  return () => document.doc.off("update", onUpdate);
}

/**
 * Puts arranged frames back in arrangement after this person's edits: a member dragged to a new
 * place takes the slot there, a new member joins at its place, and a removed one leaves no gap.
 * Every peer arranges the same way, so their results agree.
 */
export function reflowArrangements(document: CanvasDocument) {
  const items = document.list();
  if (!items.some(isArranged)) return;
  const depth = (item: Item) => {
    let levels = 0;
    for (let id = item.inside; id && levels < items.length; id = document.get(id)?.inside ?? "")
      levels++;
    return levels;
  };
  const frames = items.filter(isArranged).sort((a, b) => depth(b) - depth(a));
  const lookOf = (item: Item) => authoredLook(item, document.namedStyle(item.style));
  document.doc.transact(() => {
    for (const { id } of frames) {
      const current = document.list();
      const frame = document.get(id)!;
      if (!isArranged(frame)) continue;
      const members = current.filter(
        (item) => item.inside === id && isBox(item) && item.type !== "band"
      );
      if (!members.length) continue;
      const { moves, size } = arrangedLayout(frame, members, lookOf);
      moves.forEach(({ dx, dy }, memberId) => {
        if (Math.abs(dx) < SETTLED && Math.abs(dy) < SETTLED) return;
        movedWithContents(current, memberId, dx, dy).forEach(({ id: moved, values }) =>
          document.patch(moved, values)
        );
      });
      document.patch(id, size);
    }
  }, LOCAL);
}
