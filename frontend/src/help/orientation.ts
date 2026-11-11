import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { EditorController } from "../editor/controller";
import type { Tool } from "../editor/shapes";

/**
 * The orientation: a walk through the workspace's areas, one highlighted step at a time. It
 * points and explains without changing anything in the room, so it suits any room. Steps that
 * show a rail panel, a dock panel or Markup's bar open it, and each returns to how it was when
 * the tour ends.
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
  target: string;
  title: string;
  text: string;
  /** A tab or tool to choose before highlighting, so the area it opens is showing. */
  panel: string;
  side: "top" | "right" | "bottom" | "left";
  /** The highlighted area takes real input during this step, so what it describes can be tried. */
  tryIt: boolean;
}

export const STOPS: Stop[] = [
  {
    title: "Welcome to Arconis",
    target: "",
    panel: "",
    side: "bottom",
    tryIt: false,
    text: "This tour shows where everything is, and changes nothing in the room by itself. Use Next or the arrow keys, and Escape to stop.",
  },
  {
    target: "canvas",
    title: "The canvas",
    panel: "",
    text: "Everything in the room lives here, shared live with everyone in it. Drag empty space to select, scroll to move and pinch or Ctrl/⌘ scroll to zoom. Try it now.",
    side: "left",
    tryIt: true,
  },
  {
    target: "canvas",
    title: "Right button: menu and ring",
    panel: "",
    text: "Right-click an object or empty canvas for a menu of what applies there. Hold or drag the right button instead for a ring of the most-used commands. Try it now.",
    side: "left",
    tryIt: true,
  },
  {
    target: "rail-tools",
    title: "Select, Pan and Connect",
    panel: "",
    tryIt: false,
    text: "The tools you return to: V selects and moves, H pans the view, C connects two objects with a line. Markup sits beside them.",
    side: "right",
  },
  {
    target: "markup-tool",
    panel: "markup-tool",
    title: "Markup",
    tryIt: false,
    text: "M opens Markup's bar over the canvas: a pen, marker, arrow, box, outline and eraser for temporary notes. Annotations stay out of the layers, and the bar hides or clears them.",
    side: "right",
  },
  {
    target: "rail-add",
    panel: "rail-add",
    title: "Shapes",
    tryIt: false,
    text: "Notes, text, shapes, frames and architecture icons. Click one and then the canvas, or drag it into place. Search finds icons by name.",
    side: "right",
  },
  {
    target: "rail-draw",
    panel: "rail-draw",
    title: "Draw",
    tryIt: false,
    text: "P draws editable ink that stays part of the canvas, in the active layer. Pick the pen, shapes, erasers and fill, then set the brush.",
    side: "right",
  },
  {
    target: "dock",
    title: "Properties",
    panel: "",
    tryIt: false,
    text: "The right side holds the document. Select an object to edit it here: text, appearance, layout, relationships, tags, tasks and comments.",
    side: "left",
  },
  {
    target: "dock-layers",
    panel: "dock-layers",
    title: "Layers",
    tryIt: false,
    text: "Content lives in layers you can add, rename, reorder, merge and delete. New objects and ink go into the active layer.",
    side: "left",
  },
  {
    target: "dock-slides",
    panel: "dock-slides",
    title: "Slides and presenting",
    tryIt: false,
    text: "Frame parts of the canvas as slides, order them into decks, add speaker notes and present them full screen.",
    side: "left",
  },
  {
    target: "dock-navigate",
    panel: "dock-navigate",
    title: "Navigate",
    tryIt: false,
    text: "Jump points are objects marked for anyone in the room to fly back to. The outline, tags and history help you find your way around a large room.",
    side: "left",
  },
  {
    target: "find",
    title: "Find and filter",
    panel: "",
    tryIt: false,
    text: "Find text on the canvas, or highlight objects by tag, marker, task status or who edited them. It changes only your view.",
    side: "bottom",
  },
  {
    target: "history",
    title: "Undo and redo",
    panel: "",
    tryIt: false,
    text: "Take back your own changes, or bring them back. Other people's changes stay as they are.",
    side: "top",
  },
  {
    target: "view-controls",
    title: "Zoom and view",
    panel: "",
    tryIt: false,
    text: "Zoom, fit the whole canvas into view, and show the grid or reference lines in your view.",
    side: "top",
  },
  {
    target: "scale-controls",
    title: "Scale, units and measurement",
    panel: "",
    tryIt: false,
    text: "The scale bar shows how long a round distance is at this zoom. Measure, among the tools, reads the distance between two points; click that length and type the real one to calibrate a drawing. Settings holds the scale, units and grid spacing.",
    side: "top",
  },
  {
    target: "canvas-title",
    title: "Canvas title",
    panel: "",
    tryIt: false,
    text: "Name the canvas for everyone in the room. Exported files take this name.",
    side: "bottom",
  },
  {
    target: "share",
    title: "Share the room",
    panel: "",
    tryIt: false,
    text: "Copy the room link to invite people, or start or join another room. Rooms can also have a password.",
    side: "bottom",
  },
  {
    target: "file",
    title: "File",
    panel: "",
    tryIt: false,
    text: "Export the canvas as an editable document or a PNG with its source inside, and import either one back.",
    side: "bottom",
  },
  {
    target: "account",
    title: "Your account",
    panel: "",
    tryIt: false,
    text: "Sign in to keep canvases across devices, save private layouts and connect an assistant such as Claude or ChatGPT.",
    side: "bottom",
  },
  {
    target: "settings",
    title: "Settings",
    panel: "",
    tryIt: false,
    text: "Choose which indicators, markup and grid appear in your view, and whether the help zone shows. Settings stay on this device.",
    side: "bottom",
  },
  {
    target: "feedback",
    title: "Feedback",
    panel: "",
    tryIt: false,
    text: "Tell the Arconis team what got in your way or what works well, with a screenshot of the canvas if you choose.",
    side: "bottom",
  },
  {
    target: "participants",
    title: "Who is here",
    panel: "",
    tryIt: false,
    text: "See everyone in the room, follow someone's view, or change the name others see.",
    side: "bottom",
  },
  {
    target: "palette",
    title: "Commands and shortcuts",
    panel: "",
    tryIt: false,
    text: "Ctrl/⌘ K finds any command by name and shows its keyboard shortcut.",
    side: "top",
  },
  {
    target: "help-zone",
    title: "The help zone",
    panel: "",
    tryIt: false,
    text: "Point at or focus any control and this corner names it and says what it does. On touch screens, hold a control to read its help.",
    side: "right",
  },
  {
    target: "help",
    title: "Help",
    panel: "",
    tryIt: false,
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

/** Whether a stop is about the right dock, which a narrow screen keeps behind its toggle. */
const inDock = (stop: Stop) => (stop.panel || stop.target).startsWith("dock");

const pressedTab = (tabs: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${tabs}"] [aria-pressed="true"]`);

/** Returns the rail to the panel and fold it had before the tour opened panels. */
function restoreRail(panel: HTMLElement | null, expanded: string | null | undefined) {
  if (panel?.isConnected && panel.getAttribute("aria-pressed") !== "true") panel.click();
  // Choosing the panel can unfold the rail; fold it back once that has rendered.
  requestAnimationFrame(() => {
    const rail = document.querySelector(".left-rail");
    if (!expanded || rail?.getAttribute("data-expanded") === expanded) return;
    rail?.querySelector<HTMLElement>(".rail-collapse")?.click();
  });
}

/** Returns the dock's lower group to the panel it showed, or folds it if it was folded. */
function restoreDock(panel: HTMLElement | null) {
  const showing = pressedTab("Document panels");
  if (panel?.isConnected) {
    if (panel.getAttribute("aria-pressed") !== "true") panel.click();
  } else showing?.click();
}

/** Starts the orientation; `onEnd` runs once it closes, however it closes. */
export function startOrientation(editor: EditorController, onEnd?: () => void) {
  markOrientationSeen();
  const tool: Tool = editor.tool;
  const panel = pressedTab("Workspace panels");
  const dockPanel = pressedTab("Document panels");
  const rail = document.querySelector(".left-rail");
  const expanded = rail?.getAttribute("data-expanded");
  // Markup's bar shows only for its own stop, and a narrow screen's dock only for the dock's.
  const choose = (stop: Stop) => {
    if (stop.panel !== "markup-tool" && editor.tool === "markup") editor.setTool("select");
    const toggle = area("dock-toggle");
    if (toggle && inDock(stop) !== (toggle.getAttribute("aria-expanded") === "true"))
      toggle.click();
    const press = () => {
      const tab = stop.panel ? area(stop.panel) : null;
      if (tab?.getAttribute("aria-pressed") !== "true") tab?.click();
    };
    // A dock the toggle has just opened renders its tabs a moment later.
    if (stop.panel && !area(stop.panel)) requestAnimationFrame(press);
    else press();
  };
  const reachable = (stop: Stop) =>
    !stop.target ||
    showing(area(stop.panel || stop.target)) ||
    (inDock(stop) && showing(area("dock-toggle")));
  const steps: DriveStep[] = STOPS.filter(reachable).map((stop) => ({
    // On a narrow screen a dock stop points at the button that opens the dock.
    element: stop.target ? () => (area(stop.target) ?? area("dock-toggle"))! : undefined,
    onHighlightStarted: () => choose(stop),
    popover: { title: stop.title, description: stop.text, side: stop.side, align: "start" },
    disableActiveInteraction: !stop.tryIt,
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
    // Other steps only point; their areas wait until the tour ends.
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
      restoreDock(dockPanel);
      if (editor.tool !== tool) editor.setTool(tool);
      editor.element.focus({ preventScroll: true });
      onEnd?.();
    },
  });
  tour.drive();
  return tour;
}
