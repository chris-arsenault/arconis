/**
 * Help for the two sides of the workspace: a sentence for each tool and panel, and the guide each
 * panel opens with ?. The rail holds what a person makes; the dock holds the document.
 */
export type RailPanel = "add" | "draw";
export type DockPanel = "layers" | "slides" | "navigate";
export type Panel = RailPanel | DockPanel;

export const TOOL_DETAILS: Record<string, string> = {
  select: "Click objects to select them, and drag them to move them.",
  pan: "Drag to move your view around the canvas without changing anything.",
  connect: "Click one object, then another, to join them with a connector.",
  markup: "Annotate over the canvas with temporary marks that stay out of the layers.",
};

export const PANEL_DETAILS: Record<Panel, string> = {
  add: "Pick notes, shapes and architecture icons to place on the canvas.",
  draw: "Draw editable ink into the active layer, and choose the tool and brush.",
  layers: "Organize the canvas into layers you can add, reorder, merge and hide.",
  slides: "Frame parts of the canvas as slides and present them in order.",
  navigate: "Go to jump points, browse the outline and tags, or review recent changes.",
};

export const PANEL_TOPICS: Record<Panel, string> = {
  add: "editing#place-and-name-objects",
  draw: "drawing",
  layers: "editing#layers",
  slides: "slides",
  navigate: "editing#saved-views",
};
