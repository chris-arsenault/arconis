import type { EditorController } from "./controller";
import { closeMenu, openSubRing } from "./ui";
import { runCommand } from "./registry";

/** Editing modes shown in the canvas ring's Mode arc. */
export const RING_MODES = ["Select", "Add", "Draw", "Markup", "Connect"] as const;
export type RingMode = (typeof RING_MODES)[number];
export const MODE_WEDGE = 5;

export function currentMode(tool: string): RingMode | null {
  if (["select", "draw", "markup", "connect"].includes(tool))
    return RING_MODES.find((mode) => mode.toLowerCase() === tool) ?? null;
  return null;
}

export function chooseRingMode(editor: EditorController, mode: RingMode) {
  if (mode === "Draw" || mode === "Markup") {
    editor.setTool(mode === "Draw" ? "draw" : "markup");
    if (editor.ui.menu) editor.ui.menu.modes = false;
    openSubRing(editor, mode === "Draw" ? "ring.draw" : "ring.markup");
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
