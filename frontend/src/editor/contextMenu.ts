import { isBox, isFrame, isLink, type Item } from "../document/types";
import { isSlide } from "../document/slides";
import { MARKERS } from "../document/types";
import { worldBounds } from "../document/relations";
import type { CommandContext } from "./registry";
import { closeMenu, findCommand, isAvailable, openMenu, openSubRing, runCommand } from "./registry";
import type { EditorController } from "./controller";
import { DRAWING_SHAPES } from "./drawingTools";

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
  ids: string[];
}
type MenuSlot = string | Submenu;

const ALIGN: Submenu = {
  label: "Align",
  ids: ["left", "center", "right", "top", "middle", "bottom"].map(
    (mode) => `arrange.align.${mode}`
  ),
};
const DISTRIBUTE: Submenu = {
  label: "Distribute",
  ids: ["arrange.distribute.horizontal", "arrange.distribute.vertical"],
};
const TIDY: Submenu = {
  label: "Tidy branches",
  ids: [
    "structure.tidy",
    "structure.tidyRight",
    "structure.tidyLeft",
    "structure.tidyDown",
    "structure.tidyCompact",
    "structure.sort",
    "structure.balance",
  ],
};
const MARKER: Submenu = {
  label: "Marker",
  ids: [...MARKERS.map((marker) => `fields.marker.${marker}`), "fields.marker.none"],
};
const TAGS_AND_STATUS: MenuSlot[] = ["fields.tag", "fields.task", MARKER];
const VISIBILITY = ["fields.lock", "fields.hide", "fields.collapse"];

/** Groups by intent: text, structure, tags and status, arrangement, visibility, clipboard, view. */
const MENUS: Record<MenuContext, MenuSlot[][]> = {
  canvas: [
    ["create.noteHere", "create.textHere", "create.frameHere", "create.capture"],
    ["edit.pasteHere", "select.all"],
    ["view.fit", "view.find", "view.filter"],
    ["view.grid", "view.references", "view.save"],
    ["fields.showHidden", "fields.unlockAll"],
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
      TIDY,
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
    ["fields.lock", "fields.hide"],
    ["edit.copy", "edit.duplicate"],
    ["edit.delete"],
  ],
  slide: [
    ["structure.present", "edit.text", "comments.open"],
    TAGS_AND_STATUS,
    ["arrange.front", "arrange.back"],
    ["fields.lock", "fields.hide"],
    ["edit.cut", "edit.copy", "edit.duplicate"],
    ["view.zoomInto", "presence.copyLink"],
    ["edit.delete"],
  ],
};

/** Opens the menu where the ring was, in place of the ring. */
const MORE = "ring.more";
/** Opens the arc of editing modes beside its wedge. */
export const MODES = "ring.mode";

/**
 * The eight wedges, clockwise from the top. On anything selected the compass holds: north grows
 * a branch or the main verb, east relates, south deletes, west tags, and south-west opens the
 * menu. Stacking order and the other occasional verbs live in the menu.
 */
const RINGS: Record<MenuContext, string[]> = {
  canvas: [
    "create.noteHere",
    "create.textHere",
    "create.frameHere",
    "edit.pasteHere",
    "create.capture",
    MODES,
    "view.fit",
    "view.find",
  ],
  object: [
    "structure.branch",
    "ring.colour",
    "structure.relate",
    "comments.open",
    "edit.delete",
    MORE,
    "fields.tag",
    "ring.shape",
  ],
  line: [
    "comments.open",
    "ring.colour",
    "line.reverse",
    "arrange.route",
    "edit.delete",
    MORE,
    "fields.tag",
    "line.clearPoints",
  ],
  slide: [
    "structure.present",
    "edit.text",
    "edit.duplicate",
    "comments.open",
    "edit.delete",
    MORE,
    "fields.tag",
    "presence.copyLink",
  ],
};

/** The sub-rings a ring opens: the fills, and the shapes an object can become. */
export const SUB_RINGS: Record<string, string[]> = {
  "ring.draw": [
    "draw.freehand",
    "ring.highlight",
    "ring.vector",
    "draw.lasso",
    "ring.erasers",
    "draw.fill",
    "draw.eyedropper",
    "tool.select",
  ],
  "ring.highlight": ["draw.marker", "ring.highlightShapes", "draw.outline", "ring.draw"],
  "ring.vector": [
    "draw.shape.line",
    "draw.shape.arrow",
    "draw.shape.double-arrow",
    "draw.shape.rectangle",
    "draw.shape.ellipse",
    "draw.shape.polygon",
    "ring.drawingMarks",
    "ring.draw",
  ],
  "ring.highlightShapes": [
    "draw.highlight.line",
    "draw.highlight.arrow",
    "draw.highlight.double-arrow",
    "draw.highlight.rectangle",
    "draw.highlight.ellipse",
    "draw.highlight.polygon",
    "ring.highlightMarks",
    "ring.draw",
  ],
  "ring.drawingMarks": [
    "draw.shape.bracket",
    "draw.shape.brace",
    "draw.shape.cloud",
    "ring.vector",
  ],
  "ring.highlightMarks": [
    "draw.highlight.bracket",
    "draw.highlight.brace",
    "draw.highlight.cloud",
    "ring.highlightShapes",
  ],
  "ring.erasers": ["draw.precision", "draw.eraser", "ring.draw"],
  "ring.add": [
    "tool.note",
    "tool.text",
    "tool.rectangle",
    "tool.ellipse",
    "tool.decision",
    "tool.frame",
    "tool.service",
    "tool.database",
  ],
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
  "ring.add": "Add",
  "ring.draw": "Drawing tools",
  "ring.highlight": "Highlight",
  "ring.vector": "Vector",
  "ring.erasers": "Erase",
  "ring.highlightShapes": "Shaped highlight",
  "ring.drawingMarks": "More shapes",
  "ring.highlightMarks": "More highlights",
  "ring.colour": "Colour",
  "ring.shape": "Shape",
};

/**
 * The canvas ring's Mode wedge opens a small arc beside it with the editing modes. Nothing else
 * in the ring changes until a mode is chosen: Select, Draw and Connect switch the tool, and Add
 * shows the shapes to place in the ring.
 */
export const RING_MODES = ["Select", "Add", "Draw", "Markup", "Connect"] as const;
export type RingMode = (typeof RING_MODES)[number];
/** The Mode wedge's place in the canvas ring, where its arc opens. */
export const MODE_WEDGE = 5;

/** The mode the current tool belongs to, for marking it in the arc. */
export function currentMode(tool: string): RingMode | null {
  if (["select", "draw", "markup", "connect"].includes(tool))
    return RING_MODES.find((mode) => mode.toLowerCase() === tool) ?? null;
  return null;
}

export function chooseRingMode(editor: EditorController, mode: RingMode) {
  if (mode === "Draw" || mode === "Markup") {
    editor.setTool(mode === "Draw" ? "draw" : "markup");
    if (editor.ui.menu) editor.ui.menu.modes = false;
    openSubRing(editor, "ring.draw");
    return;
  }
  if (mode === "Add") {
    if (editor.ui.menu) editor.ui.menu.modes = false;
    openSubRing(editor, "ring.add");
    return;
  }
  closeMenu(editor);
  runCommand(editor, `tool.${mode.toLowerCase()}`);
}

export interface MenuEntry {
  id: string;
  label: string;
  /** Opens a sub-ring rather than running. */
  opens?: string[];
  /** Folds the ring away and leaves the menu in its place. */
  more?: boolean;
  /** Opens a submenu of these entries rather than running. */
  submenu?: MenuEntry[];
  /** A shorter name for a ring wedge, which still carries the full label for assistive tech. */
  short?: string;
  /** Opens the arc of editing modes beside this wedge. */
  modes?: boolean;
}

function entryFor(id: string, context: CommandContext): MenuEntry | null {
  if (id === MORE) return { id, label: "More…", more: true };
  if (id === MODES) return { id, label: "Switch mode", short: "Mode", modes: true };
  if (id in SUB_RINGS) {
    const inner = SUB_RINGS[id].filter(
      (sub) => sub in SUB_RINGS || isAvailable(findCommand(sub), context)
    );
    return inner.length ? { id, label: SUB_RING_LABELS[id], opens: inner } : null;
  }
  const command = findCommand(id);
  if (!isAvailable(command, context)) return null;
  const label = typeof command.label === "string" ? command.label : command.label(context);
  return { id, label, short: RING_LABELS[id] };
}

function slotEntry(slot: MenuSlot, context: CommandContext): MenuEntry | null {
  if (typeof slot === "string") return entryFor(slot, context);
  const inner = slot.ids.map((id) => entryFor(id, context)).filter((entry) => entry !== null);
  if (!inner.length) return null;
  // A submenu of one is just that command.
  if (inner.length === 1) return inner[0];
  return { id: `menu.${slot.label}`, label: slot.label, submenu: inner };
}

export function menuGroups(context: CommandContext): MenuEntry[][] {
  const kind = menuContextOf(context.selected);
  return MENUS[kind]
    .map((group) => group.map((slot) => slotEntry(slot, context)).filter((entry) => entry !== null))
    .filter((group) => group.length > 0);
}

/** The ring's wedges in order; a wedge that does not apply is left empty rather than shifted. */
export function ringEntries(context: CommandContext, subRing: string | null): (MenuEntry | null)[] {
  if (subRing) {
    const entries = SUB_RINGS[subRing].map((id) => entryFor(id, context));
    return Array.from({ length: 8 }, (_, index) => entries[index] ?? null);
  }
  const kind = menuContextOf(context.selected);
  return RINGS[kind].map((id) => {
    const entry = entryFor(id, context);
    return entry && RING_LABELS[id] ? { ...entry, short: RING_LABELS[id] } : entry;
  });
}

/** Wedges are narrow: these commands show a one-word name there, keeping their full label. */
const RING_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    DRAWING_SHAPES.flatMap(({ id, label }) => [
      [`draw.shape.${id}`, label],
      [`draw.highlight.${id}`, label],
    ])
  ),
  "draw.precision": "Segment",
  "draw.eraser": "Whole stroke",
  "draw.outline": "Outline",
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
  "presence.copyLink": "Copy link",
  "line.clearPoints": "Straighten",
  "arrange.route": "Route",
  "line.reverse": "Reverse",
};

/** What choosing a wedge does, by click or by stroke: open a sub-ring, show the menu, or run. */
export function chooseRingEntry(editor: EditorController, entry: MenuEntry) {
  const menu = editor.ui.menu;
  if (entry.opens) {
    openSubRing(editor, entry.id);
    return;
  }
  if (entry.modes && menu) {
    menu.modes = true;
    menu.wedge = null;
    editor.emit();
    return;
  }
  if (entry.more && menu) {
    menu.ring = false;
    menu.wedge = null;
    menu.subRing = null;
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
