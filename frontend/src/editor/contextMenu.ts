import { isBox, isFrame, isLink, type Item } from "../document/types";
import { isSlide } from "../document/slides";
import { MARKERS } from "../document/types";
import { worldBounds } from "../document/relations";
import type { CommandContext } from "./registry";
import { findCommand, isAvailable, runCommand } from "./registry";
import { closeMenu, closeSubRing, openMenu, openSubRing } from "./ui";
import type { EditorController } from "./controller";
import { DRAWING_SHAPES } from "./drawingTools";
import { RING_MODE_HELP, SUB_RING_HELP } from "./ringHelp";
import { chooseRingMode, currentMode, type RingMode } from "./ringModes";

/**
 * What the right button offers: a ring of eight commands laid out like a compass, and a menu of
 * the rest grouped by intent, both read from the command table and shaped by what was clicked.
 */

export type MenuContext = "canvas" | "object" | "line" | "slide";

export function menuContextOf(selected: Item[]): MenuContext {
  if (!selected.length) return "canvas";
  if (selected.length === 1 && isLink(selected[0])) return "line";
  if (selected.length === 1 && isSlide(selected[0])) return "slide";
  return "object";
}

/** A submenu in the menu: a label and the command ids it holds. */
interface Submenu {
  label: string;
  help: string;
  ids: string[];
}
type MenuSlot = string | Submenu;

const ALIGN: Submenu = {
  label: "Align",
  help: "Choose an edge or centre to line the selected objects up on.",
  ids: ["left", "center", "right", "top", "middle", "bottom"].map(
    (mode) => `arrange.align.${mode}`
  ),
};
const DISTRIBUTE: Submenu = {
  label: "Distribute",
  help: "Choose an axis to space the selected objects evenly along.",
  ids: ["arrange.distribute.horizontal", "arrange.distribute.vertical"],
};
const MARKER: Submenu = {
  label: "Marker",
  help: "Choose a shape badge for the selection; the room decides what each shape means.",
  ids: [...MARKERS.map((marker) => `fields.marker.${marker}`), "fields.marker.none"],
};
const TAGS_AND_STATUS: MenuSlot[] = ["fields.tag", "fields.task", MARKER];
const VISIBILITY = ["fields.lock", "fields.collapse", "fields.jump"];

/** Groups by intent: text, structure, tags and status, arrangement, visibility, clipboard, view. */
const MENUS: Record<MenuContext, MenuSlot[][]> = {
  canvas: [
    ["create.noteHere", "create.textHere", "create.frameHere", "create.capture"],
    ["edit.pasteHere", "select.all"],
    ["view.fit", "view.find", "view.filter"],
    ["view.grid", "view.references"],
    ["fields.unlockAll"],
  ],
  object: [
    ["edit.text", "edit.fitText", "comments.open"],
    [
      "structure.branch",
      "structure.sibling",
      "structure.relate",
      "structure.connect",
      "structure.swapPositions",
    ],
    TAGS_AND_STATUS,
    [
      "arrange.front",
      "arrange.back",
      ALIGN,
      DISTRIBUTE,
      "structure.tidy",
      "arrange.fitFrame",
      "edit.group",
      "edit.ungroup",
    ],
    VISIBILITY,
    ["edit.cut", "edit.copy", "edit.pasteHere", "edit.duplicate"],
    ["view.zoomInto", "presence.copyLink"],
    ["edit.delete"],
  ],
  line: [
    ["comments.open", "structure.relate"],
    TAGS_AND_STATUS,
    ["arrange.route", "line.reverse", "line.clearPoints", "arrange.front", "arrange.back"],
    ["fields.lock"],
    ["edit.copy", "edit.duplicate"],
    ["edit.delete"],
  ],
  slide: [
    ["structure.present", "edit.text", "comments.open"],
    TAGS_AND_STATUS,
    ["arrange.front", "arrange.back"],
    ["fields.lock"],
    ["edit.cut", "edit.copy", "edit.duplicate"],
    ["view.zoomInto", "presence.copyLink"],
    ["edit.delete"],
  ],
};

/** Opens the menu where the ring was, in place of the ring. */
const MORE = "ring.more";
/** Opens the ring of editing modes. */
export const MODES = "ring.mode";
/** Returns from a sub-ring to the ring that opened it. */
const BACK = "ring.back";
/** The wedges every ring keeps: the menu south-west and the modes west. */
export const MORE_WEDGE = 5;
export const MODE_WEDGE = 6;

type Slot = string | null;

/**
 * A ring: six wedges of its own, given clockwise from north through south and then north-west,
 * around the two every ring keeps. Mode is west and the menu south-west whatever was pressed
 * and whatever the mode, so those two strokes are learned once.
 */
function ring(n: Slot, ne: Slot, e: Slot, se: Slot, s: Slot, nw: Slot): Slot[] {
  return [n, ne, e, se, s, MORE, MODES, nw];
}

/**
 * What Select shows, by what was pressed. On anything selected the compass holds: north is the
 * main verb, south deletes and north-west tags. The occasional verbs live in the menu.
 */
const RINGS: Record<MenuContext, Slot[]> = {
  canvas: ring(
    "create.noteHere",
    "create.textHere",
    "create.frameHere",
    "edit.pasteHere",
    "view.fit",
    "view.find"
  ),
  object: ring(
    "structure.branch",
    "ring.colour",
    "structure.relate",
    "comments.open",
    "edit.delete",
    "fields.tag"
  ),
  line: ring(
    "comments.open",
    "ring.colour",
    "line.reverse",
    "arrange.route",
    "edit.delete",
    "fields.tag"
  ),
  slide: ring(
    "structure.present",
    "edit.text",
    "edit.duplicate",
    "comments.open",
    "edit.delete",
    "fields.tag"
  ),
};

/**
 * What a mode with tools of its own shows wherever the button is pressed: the mode's tools, so
 * choosing a mode never has to be followed by choosing a tool. Draw and Markup keep the pen
 * north, shapes east, selection south-east and the eraser south.
 */
const MODE_RINGS: Partial<Record<RingMode, Slot[]>> = {
  Draw: ring(
    "draw.freehand",
    "draw.eyedropper",
    "ring.vector",
    "draw.lasso",
    "ring.erasers",
    "draw.fill"
  ),
  Markup: ring(
    "markup.pen",
    "markup.marker",
    "markup.arrow",
    "markup.select",
    "markup.eraser",
    "markup.box"
  ),
  Add: ring(
    "tool.note",
    "tool.text",
    "tool.rectangle",
    "tool.ellipse",
    "tool.frame",
    "ring.stencils"
  ),
};

/**
 * The sub-rings a wedge opens, one level and no deeper. Entries fill the wedges clockwise from
 * north, skipping the Back wedge; a null leaves a wedge empty to hold the others in place.
 */
export const SUB_RINGS: Record<string, Slot[]> = {
  // Back is east, so the modes fan around west: straight on is Select.
  [MODES]: ["mode.Markup", null, null, "mode.Connect", "mode.Add", "mode.Select", "mode.Draw"],
  "ring.vector": [
    "draw.shape.line",
    "draw.shape.arrow",
    "draw.shape.double-arrow",
    "draw.shape.rectangle",
    "draw.shape.ellipse",
    "draw.shape.polygon",
  ],
  // Back is north, so the erasers sit around south.
  "ring.erasers": [null, null, "draw.precision", "draw.eraser"],
  "ring.stencils": ["tool.decision", "tool.service", "tool.database", "tool.cloud", "tool.person"],
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
const SUB_RING_LABELS: Record<string, string> = {
  [MODES]: "Mode",
  "ring.stencils": "Stencils",
  "ring.vector": "Vector",
  "ring.erasers": "Erase",
  "ring.colour": "Colour",
  "ring.shape": "Shape",
};

interface EntryLabel {
  id: string;
  label: string;
  /** The help zone's sentence: the command's help, or what the entry opens. */
  help: string;
  /** A shorter name for a ring wedge, which still carries the full label for assistive tech. */
  short: string;
}
export type MenuEntry = EntryLabel &
  (
    | { kind: "command" | "ring" | "more" | "back" }
    | { kind: "mode"; mode: RingMode; current: boolean }
    | { kind: "submenu"; submenu: MenuEntry[] }
  );

const BACK_ENTRY: MenuEntry = {
  id: BACK,
  label: "Back",
  help: "Return to the ring this one opened from.",
  kind: "back",
  short: "Back",
};

function entryFor(id: string, context: CommandContext): MenuEntry | null {
  if (id === MORE)
    return {
      id,
      label: "More…",
      help: "Fold the ring away and show every command that applies here as a menu.",
      kind: "more",
      short: "More…",
    };
  if (id.startsWith("mode.")) {
    const mode = id.slice(5) as RingMode;
    return {
      id,
      label: mode,
      help: RING_MODE_HELP[mode],
      kind: "mode",
      mode,
      current: currentMode(context.editor.tool) === mode,
      short: mode,
    };
  }
  if (id in SUB_RINGS) {
    const opens = SUB_RINGS[id].some((sub) => sub !== null && entryFor(sub, context) !== null);
    return opens
      ? {
          kind: "ring",
          id,
          label: SUB_RING_LABELS[id],
          help: SUB_RING_HELP[id],
          short: SUB_RING_LABELS[id],
        }
      : null;
  }
  const command = findCommand(id);
  if (!isAvailable(command, context)) return null;
  const label = typeof command.label === "string" ? command.label : command.label(context);
  return { kind: "command", id, label, help: command.help, short: RING_LABELS[id] ?? label };
}

function slotEntry(slot: MenuSlot, context: CommandContext): MenuEntry | null {
  if (typeof slot === "string") return entryFor(slot, context);
  const inner = slot.ids.map((id) => entryFor(id, context)).filter((entry) => entry !== null);
  if (!inner.length) return null;
  // A submenu of one is just that command.
  if (inner.length === 1) return inner[0];
  return {
    kind: "submenu",
    id: `menu.${slot.label}`,
    label: slot.label,
    help: slot.help,
    short: slot.label,
    submenu: inner,
  };
}

export function menuGroups(context: CommandContext): MenuEntry[][] {
  const kind = menuContextOf(context.selected);
  return MENUS[kind]
    .map((group) => group.map((slot) => slotEntry(slot, context)).filter((entry) => entry !== null))
    .filter((group) => group.length > 0);
}

/**
 * The ring's eight wedges in order; a wedge that does not apply is left empty rather than
 * shifted. The mode's own ring wins over what was pressed, and a sub-ring keeps its Back wedge
 * opposite the wedge that opened it.
 */
export function ringEntries(
  context: CommandContext,
  subRing: string | null,
  back: number | null = null
): (MenuEntry | null)[] {
  if (subRing) {
    const wedges: (MenuEntry | null)[] = Array.from({ length: 8 }, () => null);
    const free = wedges.map((_, index) => index).filter((index) => index !== back);
    if (back !== null) wedges[back] = BACK_ENTRY;
    SUB_RINGS[subRing].forEach((id, index) => {
      if (id !== null && index < free.length) wedges[free[index]] = entryFor(id, context);
    });
    return wedges;
  }
  const mode = currentMode(context.editor.tool);
  const root = (mode && MODE_RINGS[mode]) ?? RINGS[menuContextOf(context.selected)];
  return root.map((id) => (id === null ? null : entryFor(id, context)));
}

/** Wedges are narrow: these commands show a one-word name there, keeping their full label. */
const RING_LABELS: Record<string, string> = {
  ...Object.fromEntries(DRAWING_SHAPES.map(({ id, label }) => [`draw.shape.${id}`, label])),
  "draw.precision": "Segment",
  "draw.eraser": "Whole stroke",
  "draw.eyedropper": "Pick color",
  "draw.lasso": "Lasso",
  "draw.fill": "Fill",
  "markup.pen": "Pen",
  "markup.marker": "Marker",
  "markup.arrow": "Arrow",
  "markup.box": "Box",
  "markup.eraser": "Erase",
  "markup.select": "Select",
  "tool.note": "Note",
  "structure.branch": "Branch",
  "structure.relate": "Relate",
  "comments.open": "Comment",
  "fields.tag": "Tag",
  "create.noteHere": "Note",
  "create.textHere": "Text",
  "create.frameHere": "Frame",
  "edit.pasteHere": "Paste",
  "create.capture": "Capture",
  "view.fit": "Fit",
  "view.find": "Find",
  "structure.present": "Present",
  "arrange.route": "Route",
  "line.reverse": "Reverse",
};

/** Whether choosing the entry moves between rings rather than running something. */
export const opensRing = (entry: MenuEntry) => entry.kind === "ring" || entry.kind === "back";

/**
 * What choosing a wedge does, by click, by stroke or by resting on it: open a sub-ring from that
 * wedge, go back, switch mode, show the menu, or run.
 */
export function chooseRingEntry(
  editor: EditorController,
  entry: MenuEntry,
  wedge: number | null = null
) {
  const menu = editor.ui.menu;
  if (entry.kind === "ring") {
    openSubRing(editor, entry.id, wedge);
    return;
  }
  if (entry.kind === "back") {
    closeSubRing(editor);
    return;
  }
  if (entry.kind === "mode") {
    chooseRingMode(editor, entry.mode);
    return;
  }
  if (entry.kind === "more" && menu) {
    Object.assign(menu, { ring: false, wedge: null, subRing: null, back: null });
    editor.emit();
    return;
  }
  closeMenu(editor);
  runCommand(editor, entry.id);
}

/** Opens the menu over the selection, or the ring straight into one of its sub-rings. */
export function openMenuOverSelection(editor: EditorController, subRing: string | null = null) {
  const bounds = worldBounds(editor.selected());
  if (!bounds) return;
  const { scale, translate } = editor.graph.view;
  const world = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const at = { x: (world.x + translate.x) * scale, y: (world.y + translate.y) * scale };
  openMenu(editor, { at, world, wedge: null, subRing: null, ring: subRing !== null });
  if (subRing) openSubRing(editor, subRing);
}

/** Whether the frame-only verbs apply. */
export const holdsContents = (item: Item, items: Item[]) =>
  isFrame(item) && items.some((other) => other.inside === item.id && isBox(other));
