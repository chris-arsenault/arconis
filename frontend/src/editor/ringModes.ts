import type { EditorController } from "./controller";
import type { Tool } from "./shapes";
import { closeMenu } from "./ui";

/** The editing modes every ring's Mode wedge offers. */
export const RING_MODES = ["Select", "Add", "Draw", "Markup", "Connect"] as const;
export type RingMode = (typeof RING_MODES)[number];

const MODE_TOOLS: Record<string, RingMode> = {
  select: "Select",
  draw: "Draw",
  markup: "Markup",
  connect: "Connect",
};

/** The mode a tool belongs to: a shape waiting to be placed is Add; pan and measure are none. */
export function currentMode(tool: string | undefined): RingMode | null {
  if (!tool || tool === "pan" || tool === "measure") return null;
  return MODE_TOOLS[tool] ?? "Add";
}

/**
 * Switches mode and closes the ring. Each mode returns to what it last held: Draw and Markup to
 * their remembered tools, Add to the last shape placed.
 */
export function chooseRingMode(editor: EditorController, mode: RingMode) {
  closeMenu(editor);
  editor.setTool(mode === "Add" ? editor.ui.lastShape : (mode.toLowerCase() as Tool));
}
