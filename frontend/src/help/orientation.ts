import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { EditorController } from "../editor/controller";
import type { Tool } from "../editor/shapes";

/**
 * The orientation: a walk through the workspace's areas, one highlighted step at a time. It
 * points and explains without changing anything in the room, so it suits any room. Steps that
 * show a rail panel open it, and the rail returns to how it was when the tour ends.
 */
const KEY = "arconis-orientation";

/** Whether this browser has taken or declined the orientation. */
export function orientationSeen() {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true;
  }
}

export function markOrientationSeen() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {
    // Without storage the offer simply returns next visit.
  }
}

interface Stop {
  /** The `data-help-id` of the area to highlight; none centres the step on the screen. */
  target?: string;
  title: string;
  text: string;
  /** A rail panel tab to choose before highlighting, so its panel is showing. */
  panel?: string;
  side?: "top" | "right" | "bottom" | "left";
}

export const STOPS: Stop[] = [
  {
    title: "Welcome to Arconis",
    text: "This tour shows where everything is. It changes nothing in the room. Use Next or the arrow keys, and Escape to stop.",
  },
  {
    target: "canvas",
    title: "The canvas",
    text: "Everything in the room lives here, shared live with everyone in it. Drag empty space to select, scroll to move and pinch or Ctrl/⌘ scroll to zoom.",
    side: "left",
  },
  {
    target: "canvas",
    title: "Right button: menu and ring",
    text: "Right-click an object or empty canvas for a menu of what applies there. Hold the right button instead for a ring of the most-used commands.",
    side: "left",
  },
  {
    target: "rail-tools",
    title: "Select, Pan and Connect",
    text: "The three tools you return to: V selects and moves, H pans the view, C connects two objects with a line.",
    side: "right",
  },
  {
    target: "rail-add",
    panel: "rail-add",
    title: "Add",
    text: "Notes, text, shapes, frames and architecture icons. Click one and then the canvas, or drag it into place. Search finds icons by name.",
    side: "right",
  },
  {
    target: "rail-draw",
    panel: "rail-draw",
    title: "Draw and markup",
    text: "P draws editable ink into the current layer. M marks up above everything, for review notes. Pick pens, highlighters, shapes and the eraser here.",
    side: "right",
  },
  {
    target: "rail-layers",
    panel: "rail-layers",
    title: "Layers",
    text: "Content lives in layers you can add, rename, reorder, merge and delete. New objects go into the active layer.",
    side: "right",
  },
  {
    target: "rail-explore",
    panel: "rail-explore",
    title: "Explore",
    text: "Saved views are shared places on the canvas anyone can return to. The outline, tags and history help you find your way around a large room.",
    side: "right",
  },
  {
    target: "rail-slides",
    panel: "rail-slides",
    title: "Slides and presenting",
    text: "Frame parts of the canvas as slides, order them into decks, add speaker notes and present them full screen.",
    side: "right",
  },
  {
    target: "properties",
    title: "Properties",
    text: "Select an object to edit it here: text, appearance, layout, relationships, tags, tasks and comments.",
    side: "left",
  },
  {
    target: "find",
    title: "Find and filter",
    text: "Find text on the canvas, or highlight objects by tag, marker, task status or who edited them. It changes only your view.",
    side: "bottom",
  },
  {
    target: "history",
    title: "Undo and redo",
    text: "Take back your own changes, or bring them back. Other people's changes stay as they are.",
    side: "top",
  },
  {
    target: "view-controls",
    title: "Zoom and view",
    text: "Zoom, fit the whole canvas into view, and show the grid or reference lines in your view.",
    side: "top",
  },
  {
    target: "canvas-title",
    title: "Canvas title",
    text: "Name the canvas for everyone in the room. Exported files take this name.",
    side: "bottom",
  },
  {
    target: "share",
    title: "Share the room",
    text: "Copy the room link to invite people, or start or join another room. Rooms can also have a password.",
    side: "bottom",
  },
  {
    target: "file",
    title: "File",
    text: "Export the canvas as an editable document or a PNG with its source inside, and import either one back.",
    side: "bottom",
  },
  {
    target: "account",
    title: "Your account",
    text: "Sign in to keep canvases across devices, save private layouts and connect an assistant such as Claude or ChatGPT.",
    side: "bottom",
  },
  {
    target: "settings",
    title: "Settings",
    text: "Choose which indicators, markup and grid appear in your view, and whether the help zone shows. Settings stay on this device.",
    side: "bottom",
  },
  {
    target: "participants",
    title: "Who is here",
    text: "See everyone in the room, follow someone's view, or change the name others see.",
    side: "bottom",
  },
  {
    target: "palette",
    title: "Commands and shortcuts",
    text: "Ctrl/⌘ K finds any command by name and shows its keyboard shortcut.",
    side: "top",
  },
  {
    target: "help-zone",
    title: "The help zone",
    text: "Point at or focus any control and this corner names it and says what it does. On touch screens, hold a control to read its help.",
    side: "right",
  },
  {
    target: "help",
    title: "Help",
    text: "The full guides, every command and this tour are here whenever you need them. Press ? to open help.",
    side: "bottom",
  },
];

const area = (id: string) =>
  document.querySelector<HTMLElement>(`[data-help-id="${CSS.escape(id)}"]`);

function showing(element: HTMLElement | null) {
  if (!element?.checkVisibility()) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Returns the rail to the panel and fold it had before the tour opened panels. */
function restoreRail(panel: HTMLElement | null, expanded: string | null | undefined) {
  if (panel?.isConnected && panel.getAttribute("aria-pressed") !== "true") panel.click();
  const rail = document.querySelector(".left-rail");
  if (!expanded || rail?.getAttribute("data-expanded") === expanded) return;
  rail?.querySelector<HTMLElement>(".rail-collapse")?.click();
}

/** Starts the orientation; `onEnd` runs once it closes, however it closes. */
export function startOrientation(editor: EditorController, onEnd?: () => void) {
  markOrientationSeen();
  const tool: Tool = editor.tool;
  const tabs = document.querySelector('[aria-label="Workspace panels"]');
  const panel = tabs?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? null;
  const rail = document.querySelector(".left-rail");
  const expanded = rail?.getAttribute("data-expanded");
  const choose = (id: string) => {
    const tab = area(id);
    if (tab?.getAttribute("aria-pressed") !== "true") tab?.click();
  };
  const steps: DriveStep[] = STOPS.filter(
    (stop) => !stop.target || stop.panel || showing(area(stop.target))
  ).map((stop) => ({
    element: stop.target ? () => area(stop.target!)! : undefined,
    onHighlightStarted: stop.panel ? () => choose(stop.panel!) : undefined,
    popover: { title: stop.title, description: stop.text, side: stop.side, align: "start" },
  }));
  const tour = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    closeBtnLabel: "Close tour",
    popoverClass: "arconis-tour",
    stagePadding: 4,
    stageRadius: 8,
    allowKeyboardControl: true,
    overlayClickBehavior: "none",
    // Pointing at an area never edits it; the tour stays a tour.
    disableActiveInteraction: true,
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute("role", "dialog");
      popover.wrapper.setAttribute("aria-modal", "false");
      popover.title.id = "arconis-tour-title";
      popover.description.id = "arconis-tour-text";
      popover.wrapper.setAttribute("aria-labelledby", "arconis-tour-title");
      popover.wrapper.setAttribute("aria-describedby", "arconis-tour-text");
      for (const [button, detail] of [
        [popover.nextButton, "Go to the next step of the tour."],
        [popover.previousButton, "Go back one step."],
        [popover.closeButton, "End the tour. Help can start it again."],
      ] as const)
        button.setAttribute("data-hint-detail", detail);
    },
    // Focus belongs in the step's popup, where the arrow keys move the tour; the canvas keeps
    // arrow keys for itself.
    onHighlighted: (_element, _step, { state }) =>
      state.popover?.nextButton.focus({ preventScroll: true }),
    onDestroyed: () => {
      restoreRail(panel, expanded);
      if (editor.tool !== tool) editor.setTool(tool);
      editor.element.focus({ preventScroll: true });
      onEnd?.();
    },
  });
  tour.drive();
  return tour;
}
