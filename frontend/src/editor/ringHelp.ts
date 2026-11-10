import type { RingMode } from "./ringModes";

/** The help zone's sentence for each sub-ring, which opens choices rather than running. */
export const SUB_RING_HELP: Record<string, string> = {
  "ring.mode": "Open a ring of editing modes: Select, Add, Draw, Markup and Connect.",
  "ring.stencils": "Open a ring of diagram shapes to place with the next click on the canvas.",
  "ring.highlight": "Open a ring of translucent highlighters and the object outline.",
  "ring.vector": "Open a ring of shapes to construct in ink.",
  "ring.erasers": "Open a ring with the whole-stroke and segment erasers.",
  "ring.colour": "Open a ring of fill colours for the selection.",
  "ring.shape": "Open a ring of kinds the selection can become, keeping its text and lines.",
};

/** What each editing mode in the Mode ring does when chosen. */
export const RING_MODE_HELP: Record<RingMode, string> = {
  Select: "Switch to Select, where clicks and drags select and move objects.",
  Add: "Switch to placing the shape you last added; the ring then offers the other shapes.",
  Draw: "Switch to drawing ink with your last brush; the ring then offers the drawing tools.",
  Markup: "Switch to temporary annotations with your last tool; the ring then offers Markup's.",
  Connect: "Switch to the connector tool: click one object, then another, to join them.",
};
