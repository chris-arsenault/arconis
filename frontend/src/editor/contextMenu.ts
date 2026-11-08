import { isBox, isFrame, isLink, type Item } from "../document/types";
import { isSlide } from "../document/slides";
import type { CommandContext } from "./registry";
import { findCommand, isAvailable } from "./registry";

/**
 * What the right button offers: a ring of the eight commands people reach for most, and a menu
 * of the rest in groups, both read from the command table and shaped by what was clicked.
 */

export type MenuContext = "canvas" | "object" | "line" | "slide";

export function menuContextOf(selected: Item[]): MenuContext {
  if (!selected.length) return "canvas";
  if (selected.length === 1 && isLink(selected[0])) return "line";
  if (selected.length === 1 && isSlide(selected[0])) return "slide";
  return "object";
}

/** Command ids in groups; ids that do not apply are left out, and empty groups vanish. */
const MENUS: Record<MenuContext, string[][]> = {
  canvas: [
    ["create.noteHere", "create.textHere", "edit.pasteHere"],
    ["select.all", "view.fit", "view.grid", "view.references"],
    ["view.save", "fields.showHidden", "fields.unlockAll"],
  ],
  object: [
    ["edit.text", "structure.branch", "structure.sibling"],
    ["edit.cut", "edit.copy", "edit.pasteHere", "edit.duplicate", "comments.open"],
    [
      "structure.connect",
      "structure.reference",
      "structure.swapPositions",
      "edit.group",
      "edit.ungroup",
    ],
    [
      "arrange.front",
      "arrange.back",
      "arrange.align.left",
      "arrange.align.center",
      "arrange.align.right",
      "arrange.align.top",
      "arrange.align.middle",
      "arrange.align.bottom",
      "arrange.distribute.horizontal",
      "arrange.distribute.vertical",
      "structure.tidy",
    ],
    [
      "fields.lock",
      "fields.hide",
      "fields.collapse",
      "fields.task",
      "edit.fitText",
      "arrange.fitFrame",
    ],
    ["view.zoomInto", "presence.copyLink"],
    ["edit.delete"],
  ],
  line: [
    ["comments.open", "arrange.route", "line.reverse", "line.clearPoints"],
    ["arrange.front", "arrange.back", "fields.lock", "fields.hide"],
    ["edit.delete"],
  ],
  slide: [
    ["structure.present", "edit.text"],
    ["edit.cut", "edit.copy", "edit.duplicate", "comments.open"],
    ["arrange.front", "arrange.back", "fields.lock", "fields.hide"],
    ["view.zoomInto", "presence.copyLink"],
    ["edit.delete"],
  ],
};

/** The eight wedges of the ring, clockwise from the top, by context. */
const RINGS: Record<MenuContext, string[]> = {
  canvas: [
    "create.noteHere",
    "edit.pasteHere",
    "view.fit",
    "create.textHere",
    "select.all",
    "view.grid",
    "view.save",
    "view.references",
  ],
  object: [
    "edit.text",
    "ring.colour",
    "edit.duplicate",
    "ring.shape",
    "edit.delete",
    "comments.open",
    "arrange.back",
    "arrange.front",
  ],
  line: [
    "comments.open",
    "ring.colour",
    "line.reverse",
    "arrange.route",
    "edit.delete",
    "line.clearPoints",
    "arrange.back",
    "arrange.front",
  ],
  slide: [
    "structure.present",
    "edit.text",
    "edit.duplicate",
    "comments.open",
    "edit.delete",
    "presence.copyLink",
    "arrange.back",
    "arrange.front",
  ],
};

/** The sub-rings a ring opens: the fills, and the shapes an object can become. */
export const SUB_RINGS: Record<string, string[]> = {
  "ring.colour": [
    "colour.0",
    "colour.1",
    "colour.2",
    "colour.3",
    "colour.4",
    "colour.5",
    "colour.clear",
  ],
  "ring.shape": [
    "shape.rectangle",
    "shape.ellipse",
    "shape.decision",
    "shape.note",
    "shape.card",
    "shape.service",
    "shape.database",
    "shape.text",
  ],
};
const SUB_RING_LABELS: Record<string, string> = { "ring.colour": "Colour", "ring.shape": "Shape" };

export interface MenuEntry {
  id: string;
  label: string;
  /** Opens a sub-ring rather than running. */
  opens?: string[];
}

function entryFor(id: string, context: CommandContext): MenuEntry | null {
  if (id in SUB_RINGS) {
    const inner = SUB_RINGS[id].filter((sub) => isAvailable(findCommand(sub), context));
    return inner.length ? { id, label: SUB_RING_LABELS[id], opens: inner } : null;
  }
  const command = findCommand(id);
  if (!isAvailable(command, context)) return null;
  const label = typeof command.label === "string" ? command.label : command.label(context);
  return { id, label };
}

export function menuGroups(context: CommandContext): MenuEntry[][] {
  const kind = menuContextOf(context.selected);
  return MENUS[kind]
    .map((group) => group.map((id) => entryFor(id, context)).filter((entry) => entry !== null))
    .filter((group) => group.length > 0);
}

/** The ring's wedges in order; a wedge that does not apply is left empty rather than shifted. */
export function ringEntries(context: CommandContext, subRing: string | null): (MenuEntry | null)[] {
  if (subRing) return SUB_RINGS[subRing].map((id) => entryFor(id, context));
  const kind = menuContextOf(context.selected);
  return RINGS[kind].map((id) => entryFor(id, context));
}

/** Whether the frame-only verbs apply. */
export const holdsContents = (item: Item, items: Item[]) =>
  isFrame(item) && items.some((other) => other.inside === item.id && isBox(other));
