/** The rail's help: a sentence for each tool and panel, and the guide each panel opens with ?. */
export type Panel = "add" | "draw" | "layers" | "explore" | "slides";

export const TOOL_DETAILS: Record<string, string> = {
  select: "Click objects to select them, and drag them to move them.",
  pan: "Drag to move your view around the canvas without changing anything.",
  connect: "Click one object, then another, to join them with a connector.",
};

export const PANEL_DETAILS: Record<Panel, string> = {
  add: "Pick notes, shapes and architecture icons to place on the canvas.",
  draw: "Start drawing, and choose the brush and whether ink goes in a layer or markup.",
  layers: "Organize the canvas into layers you can add, reorder, merge and hide.",
  explore: "Go to saved views, browse the outline and tags, or review recent changes.",
  slides: "Frame parts of the canvas as slides and present them in order.",
};

export const PANEL_TOPICS: Record<Panel, string> = {
  add: "editing#place-and-name-objects",
  draw: "drawing",
  layers: "editing#layers",
  explore: "editing#saved-views",
  slides: "slides",
};
