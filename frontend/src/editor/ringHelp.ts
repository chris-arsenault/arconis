import type { RingMode } from "./contextMenu";

/** The help zone's sentence for each sub-ring, which opens choices rather than running. */
export const SUB_RING_HELP: Record<string, string> = {
  "ring.add": "Open a ring of shapes to place with the next click on the canvas.",
  "ring.draw": "Open a ring of drawing tools for ink in the active layer.",
  "ring.markup": "Open a ring of Markup's pen, marker, arrow, box, outline and eraser.",
  "ring.highlight": "Open a ring of translucent highlighters and the object outline.",
  "ring.vector": "Open a ring of shapes to construct in ink.",
  "ring.erasers": "Open a ring with the whole-stroke and segment erasers.",
  "ring.highlightShapes": "Open a ring of shapes to draw as translucent highlights.",
  "ring.drawingMarks": "Open a ring of brackets, braces and revision clouds to draw in ink.",
  "ring.highlightMarks": "Open a ring of brackets, braces and revision clouds to highlight with.",
  "ring.colour": "Open a ring of fill colours for the selection.",
  "ring.shape": "Open a ring of kinds the selection can become, keeping its text and lines.",
};

/** What each editing mode in the Mode arc does when chosen. */
export const RING_MODE_HELP: Record<RingMode, string> = {
  Select: "Switch to Select, where clicks and drags select and move objects.",
  Add: "Open a ring of shapes to place with the next click on the canvas.",
  Draw: "Switch to drawing ink into the active content layer, and open the drawing tools.",
  Markup: "Switch to temporary annotations above the canvas, and open Markup's tools.",
  Connect: "Switch to the connector tool: click one object, then another, to join them.",
};
