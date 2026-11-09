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
  modes?: boolean;
  mode?: number | null;
}
