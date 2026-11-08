import type { CanvasDocument } from "../document/canvasDocument";
import { worldBounds } from "../document/relations";
import { LOCAL, isBox, type Item } from "../document/types";
import { DEFAULT_GAP } from "../document/layout";
import { reflowArrangements } from "./arrangements";

/** Room between gathered objects in their new frame. */
const GATHER_GAP = 20;

/**
 * Gathers objects into a new frame that keeps them in a grid, placed to the right of everything
 * on the canvas. Objects held by something else leave it; lines between them come along.
 */
export function gatherIntoFrame(document: CanvasDocument, ids: string[], title = "Gathered") {
  const items = document.list();
  const chosen = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Item => item !== undefined && isBox(item) && !item.onLine);
  // A chosen object inside another chosen object stays with its holder.
  const chosenIds = new Set(chosen.map((item) => item.id));
  const members = chosen.filter((item) => !chosenIds.has(item.inside));
  if (!members.length) return "";
  const bounds = worldBounds(items) ?? { x: 0, y: 0, width: 0, height: 0 };
  const columns = Math.max(1, Math.ceil(Math.sqrt(members.length)));
  const frame = document.build("frame", bounds.x + bounds.width + DEFAULT_GAP * 2, bounds.y, {
    name: title,
    arrange: { how: "grid", columns, gap: GATHER_GAP },
  });
  document.undo.stopCapturing();
  document.doc.transact(() => {
    document.insert(frame);
    members.forEach((member, index) =>
      document.patch(member.id, {
        inside: frame.id,
        x: frame.x + index,
        y: frame.y + Math.floor(index / columns),
      })
    );
    reflowArrangements(document);
  }, LOCAL);
  document.undo.stopCapturing();
  return frame.id;
}
