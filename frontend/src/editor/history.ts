import type * as Y from "yjs";
import type { CanvasDocument } from "../document/canvasDocument";
import { typeLabel, type Item } from "../document/types";

/**
 * History people can read: each undo step carries a label such as "Move 3 objects", derived
 * from what the step changed, so a panel can list the steps and return to any of them. There is
 * no history beyond the undo stack and each item's last editor.
 */

export const LABEL = "label";

type StackItem = { meta: Map<unknown, unknown> };
type ChangeEvent = Y.YEvent<Y.AbstractType<unknown>>;
type StackEvent = {
  stackItem: StackItem;
  changedParentTypes: Map<unknown, ChangeEvent[]>;
};

/** The key under which a type sits in its parent, when it is one of a map's entries. */
function keyOf(type: Y.AbstractType<unknown> | null) {
  const key = type?._item?.parentSub;
  return typeof key === "string" ? key : null;
}

/** What a step changed: records added or removed, and the keys changed on existing records. */
function changes(document: CanvasDocument, event: StackEvent) {
  const root = document.items as unknown as Y.AbstractType<unknown>;
  const ids = new Set<string>();
  const keys = new Set<string>();
  let membership = false;
  for (const change of event.changedParentTypes.get(root) ?? []) {
    const target: Y.AbstractType<unknown> = change.target;
    if (target === root) {
      membership = true;
      change.changes.keys.forEach((_change, key) => ids.add(key));
      continue;
    }
    // The record itself, or its name text or look map one level down.
    const record = target.parent === root ? target : target.parent;
    const id = keyOf(record);
    if (id) ids.add(id);
    if (target === record) change.changes.keys.forEach((_change, key) => keys.add(key));
    else keys.add(keyOf(target) ?? "");
  }
  return { ids, keys, membership };
}

const GEOMETRY = new Set(["x", "y", "width", "height", "points"]);

/** The verb for a step: what kind of change its keys amount to. */
function verb(keys: Set<string>) {
  const names = [...keys].filter((key) => key !== "editedBy" && key !== "editedAt");
  if (names.length && names.every((key) => GEOMETRY.has(key))) return "Move";
  if (names.includes("name")) return "Edit text of";
  if (names.includes("look")) return "Restyle";
  if (names.includes("inside")) return "Regroup";
  return "Change";
}

function nouns(items: Item[], ids: Set<string>) {
  if (ids.size === 1) {
    const item = items.find((candidate) => candidate.id === [...ids][0]);
    if (item) return item.name.split("\n")[0] || typeLabel(item);
  }
  return `${ids.size} ${ids.size === 1 ? "object" : "objects"}`;
}

/** A label for an undo step, read from the records it changed and what now exists. */
export function describeStep(document: CanvasDocument, event: StackEvent) {
  const { ids, keys, membership } = changes(document, event);
  const items = document.list();
  if (membership) {
    const present = [...ids].filter((id) => document.items.has(id)).length;
    const added = present * 2 >= ids.size;
    return `${added ? "Add" : "Delete"} ${ids.size ? nouns(items, ids) : "objects"}`;
  }
  return ids.size ? `${verb(keys)} ${nouns(items, ids)}` : "Change";
}

/** Labels every undo step as it is made or grows, until stopped. */
/** A step's mirror says what redoing or undoing it again would do, so Add and Delete swap. */
function mirrored(label: string) {
  if (label.startsWith("Add ")) return `Delete ${label.slice(4)}`;
  if (label.startsWith("Delete ")) return `Add ${label.slice(7)}`;
  return label;
}

export function labelHistory(document: CanvasDocument) {
  const label = (raw: unknown, manager: { undoing: boolean; redoing: boolean }) => {
    const event = raw as StackEvent;
    const described = describeStep(document, event);
    const mirror = manager.undoing || manager.redoing;
    event.stackItem.meta.set(LABEL, mirror ? mirrored(described) : described);
  };
  document.undo.on("stack-item-added", label);
  document.undo.on("stack-item-updated", label);
  return () => {
    document.undo.off("stack-item-added", label);
    document.undo.off("stack-item-updated", label);
  };
}

/** The undo steps, newest first, and the redo steps, next first, as labels. */
export function historyEntries(document: CanvasDocument) {
  const read = (items: StackItem[]) =>
    items.map((item) => {
      const label: unknown = item.meta.get(LABEL);
      return typeof label === "string" ? label : "Change";
    });
  return {
    undo: read(document.undo.undoStack).reverse(),
    redo: read(document.undo.redoStack).reverse(),
  };
}

/** Undoes or redoes `count` steps. */
export function travelHistory(document: CanvasDocument, direction: "undo" | "redo", count: number) {
  for (let step = 0; step < count; step++) {
    if (direction === "undo") document.undo.undo();
    else document.undo.redo();
  }
}
