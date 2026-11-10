import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { EditorController } from "../editor/controller";
import type { RoomSession } from "../collaboration/room";
import { isMarkup } from "../document/ink";
import type { Item } from "../document/types";

/**
 * The hands-on tutorial: a room on this device only, filled with a small sample, where each step
 * waits for the person to do the thing it describes. Nothing in it reaches anyone else.
 */
const KEY = "arconis-practice";
const EVENT = "arconis:practice";

export const PRACTICE_CANVAS = `arconis 1
title "Practice canvas"
note welcome "Edit me" at 0,0 size 200,120
frame shop "Online shop" below welcome gap 60 row gap 60 {
  node web "Web app" service
  node api "Orders API" service
  node db "Orders" database
}
web -> api
slide overview "Online shop" deck practice 1 at -120,-80 size 1280,720
`;

/** Asks the app for a fresh practice room; the tutorial starts once it opens. */
export function requestPractice() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The app opens a practice room on request, remembering which room should start the tutorial. */
export function onPracticeRequest(open: () => string) {
  const listener = () => {
    const id = open();
    try {
      sessionStorage.setItem(KEY, id);
    } catch {
      // Without storage the room opens empty of the tutorial, as an ordinary local room.
    }
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

function claimPractice(room: string) {
  try {
    if (sessionStorage.getItem(KEY) !== room) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

interface Task {
  title: string;
  text: string;
  /** What to highlight, by `data-help-id`; the rest of the screen waits under the overlay. */
  target: string;
  /** Areas besides the target the person needs to reach. */
  reach: string[];
  /** Whether the person has done it. */
  done: (editor: EditorController, start: Item[]) => boolean;
}

const named = (items: Item[], id: string) => items.find((item) => item.id === id);
const joined = (items: Item[], a: string, b: string) =>
  items.some(
    (item) =>
      item.type === "line" &&
      ((item.from === a && item.to === b) || (item.from === b && item.to === a))
  );

export const TASKS: Task[] = [
  {
    title: "Edit an object",
    reach: [],
    text: "Double-click the note that says “Edit me”, type something of your own, then press Ctrl/⌘ Enter or click away.",
    target: "canvas",
    // Done once the edit is finished, not at the first keystroke.
    done: (editor, start) =>
      !editor.editId &&
      named(editor.document.list(), "welcome")?.name !== named(start, "welcome")?.name,
  },
  {
    title: "Connect two objects",
    reach: [],
    text: "Press C for the connector, then click Orders API and then Orders. The line stays attached when either one moves.",
    target: "canvas",
    done: (editor) => joined(editor.document.list(), "api", "db"),
  },
  {
    title: "Mark it up",
    text: "Press M for Markup and drag across the diagram, as you would to circle something in a review. Markup sits above everything and stays out of the layers.",
    target: "canvas",
    reach: ["rail-tools", "markup-bar"],
    done: (editor, start) =>
      editor.document.list().filter(isMarkup).length > start.filter(isMarkup).length,
  },
  {
    title: "Present it",
    text: "Open Slides on the right and press Present beside the practice deck. Escape leaves the presentation. That is the whole practice.",
    target: "dock-slides",
    reach: ["dock", "dock-toggle"],
    done: (editor) => editor.presenter.active,
  },
];

const area = (id: string) =>
  document.querySelector<HTMLElement>(`[data-help-id="${CSS.escape(id)}"]`);

/** Fills a fresh practice room and walks its tasks; any other room is left alone. */
export async function startPractice(session: RoomSession, editor: EditorController) {
  if (!claimPractice(session.id)) return null;
  if (!session.document.list().length)
    await session.files.import(new File([PRACTICE_CANVAS], "practice.arconis"));
  editor.fit();
  const start = editor.document.list();
  let unsubscribe = () => {};
  const steps: DriveStep[] = TASKS.map((task) => ({
    element: () => area(task.target)!,
    popover: { title: task.title, description: task.text, showButtons: ["close"] },
    allowedElements: () => [task.target, ...task.reach].map(area).filter((node) => node !== null),
  }));
  const tour = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    closeBtnLabel: "Stop practising",
    popoverClass: "arconis-tour",
    stagePadding: 4,
    stageRadius: 8,
    overlayOpacity: 0.35,
    overlayClickBehavior: "none",
    // The tasks use the canvas's own keys, so focus stays on the canvas rather than the popup.
    onHighlighted: () => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.closest(".driver-popover"))
        editor.element.focus({ preventScroll: true });
    },
    onDestroyed: () => unsubscribe(),
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute("role", "dialog");
      popover.wrapper.setAttribute("aria-modal", "false");
      popover.wrapper.setAttribute("aria-live", "polite");
      popover.closeButton.setAttribute(
        "data-hint-detail",
        "End the practice; the room and your changes stay on this device."
      );
    },
  });
  // Each task moves on when the room shows it done; presenting ends the walk.
  const check = () => {
    const index = tour.getActiveIndex();
    if (index === undefined || !TASKS[index].done(editor, start)) return;
    if (tour.isLastStep()) tour.destroy();
    else tour.moveNext();
  };
  unsubscribe = editor.subscribe(check);
  tour.drive();
  return tour;
}
