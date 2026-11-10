import type { EditorController } from "./controller";
import { EMPTY_FILTER } from "./filter";

/** Form controls and modal/menu surfaces own input instead of the canvas underneath them. */
export function isInputTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    ((target instanceof HTMLElement && target.isContentEditable) ||
      Boolean(target.closest("input, textarea, select, dialog, [role=dialog], [role=menu]")))
  );
}

/** What this person has open over the canvas; commands toggle it and the editor's `emit` shows it. */
export interface EditorUi {
  palette: boolean;
  find: boolean;
  filter: boolean;
  /** Pasted text waiting to be made into notes, a tree or a text block, at a world point. */
  pasteAs: { text: string; at: { x: number; y: number } } | null;
  /** A run of capturing notes, stacking from a point. */
  capture: { at: { x: number; y: number }; ids: string[] } | null;
  /** The participant whose view this view follows, by awareness client id. */
  following: number | null;
  /** Whether the laser key is held, and this person's own trail while it fades. */
  lasering: boolean;
  laser: { x: number; y: number; at: number }[];
  /** Whether the cursor chat line is open. */
  chat: boolean;
  /** Calls to follow this person has dismissed, by the time they were made. */
  dismissedSpotlights: number[];
  /** An item to ring briefly, after a deep link or a find. */
  pulse: string | null;
  /** The command ring and context menu, open at a point on the canvas. */
  menu: MenuState | null;
  /** The item whose comments are open in a modal above it. */
  comments: string | null;
  /** Whether the tag editor floats over the selection. */
  tagging: boolean;
  /** The source object awaiting a relation target on the canvas or in optional search. */
  relating: string | null;
  /** Whether a native move or resize is in progress, when floating controls step aside. */
  dragging: boolean;
  /** The help reference, open at a topic: a guide id, `guide#anchor`, or `commands`. */
  help: string | null;
}

/** Nothing open, nothing followed, nothing dragged: how an editor starts. */
export function initialUi(): EditorUi {
  return {
    palette: false,
    find: false,
    filter: false,
    pasteAs: null,
    capture: null,
    following: null,
    lasering: false,
    laser: [],
    chat: false,
    dismissedSpotlights: [],
    pulse: null,
    menu: null,
    comments: null,
    tagging: false,
    relating: null,
    dragging: false,
    help: null,
  };
}

export interface MenuState {
  /** Where the menu opened, in canvas-area pixels, and the world point beneath it. */
  at: { x: number; y: number };
  world: { x: number; y: number };
  /** The visible wedge under a held pointer, or null in the neutral centre or outside the ring. */
  wedge: number | null;
  /** The sub-ring open in place of the ring, by the entry that opened it. */
  subRing: string | null;
  /** Whether the ring shows: a held or dragged right button brings it; a click leaves the menu. */
  ring: boolean;
  /** Whether the Mode wedge's arc of editing modes shows, and which of its modes a held pointer is on. */
  modes: boolean;
  mode: number | null;
}

/** Opens or closes the palette, returning focus to the canvas when it closes. */
export function showPalette(editor: EditorController, open: boolean) {
  editor.ui.palette = open;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/**
 * Opens the help reference at a topic, or closes it. It sits beside the canvas without blocking
 * it, so people can read and try at once.
 */
export function showHelp(editor: EditorController, topic: string | null) {
  editor.ui.help = topic;
  editor.emit();
}

/** Opens or closes find on canvas, returning focus to the canvas when it closes. */
export function showFind(editor: EditorController, open: boolean) {
  editor.ui.find = open;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Closing the filter bar clears its filter so nothing stays dimmed. */
export function showFilter(editor: EditorController, open: boolean) {
  editor.ui.filter = open;
  if (!open) editor.setFilter(EMPTY_FILTER);
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

export function openMenu(editor: EditorController, menu: Omit<MenuState, "modes" | "mode">) {
  editor.ui.menu = { ...menu, modes: false, mode: null };
  editor.emit();
}

export function closeMenu(editor: EditorController) {
  if (!editor.ui.menu) return;
  editor.ui.menu = null;
  editor.emit();
}

export function openSubRing(editor: EditorController, id: string) {
  if (!editor.ui.menu) return;
  editor.ui.menu.subRing = id;
  editor.ui.menu.wedge = null;
  editor.ui.menu.modes = false;
  editor.emit();
}

export function showComments(editor: EditorController, id: string | null) {
  editor.ui.comments = id;
  editor.emit();
  if (!id) editor.element.focus({ preventScroll: true });
}

export function showTagger(editor: EditorController, open: boolean) {
  editor.ui.tagging = open;
  if (open) editor.ui.relating = null;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Starts canvas target picking while preserving the original source object. */
export function showRelate(editor: EditorController, open: boolean) {
  if (open) {
    const from = editor.selected()[0];
    if (!from) return;
    editor.setTool("select");
    editor.ui.relating = from.id;
    editor.ui.tagging = false;
  } else editor.ui.relating = null;
  editor.emit();
  editor.element.focus({ preventScroll: true });
}

export function startCapture(editor: EditorController, at: { x: number; y: number }) {
  editor.ui.capture = { at, ids: [] };
  editor.emit();
}

export function endCapture(editor: EditorController) {
  editor.ui.capture = null;
  editor.emit();
  editor.element.focus({ preventScroll: true });
}
