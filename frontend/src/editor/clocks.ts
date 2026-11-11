import type { CanvasDocument } from "../document/canvasDocument";
import {
  isFinished,
  isRunning,
  newClock,
  paused,
  reset,
  started,
  type Clock,
  type ClockKind,
} from "../document/clock";
import type { Item, Look } from "../document/types";
import type { CommandDefinition as Command, CommandContext } from "./registry";

/** Clocks as people use them: placing one, running it, and the three looks it comes in. */

/** The looks a clock is offered in; each is ordinary appearance, changed afterwards like any. */
export const CLOCK_LOOKS: { id: string; label: string; look: Look }[] = [
  { id: "light", label: "Light", look: { fill: "#ffffff", line: "#c9cfdd", textColor: "#1f2433" } },
  { id: "dark", label: "Dark", look: { fill: "#1f2433", line: "#1f2433", textColor: "#ffffff" } },
  {
    id: "accent",
    label: "Accent",
    look: { fill: "#7560cb", line: "#7560cb", textColor: "#ffffff" },
  },
];

/** What a newly placed clock starts as: a five-minute timer with large digits and no name. */
export function newClockFields(): Partial<Item> {
  return { name: "", clock: newClock("timer"), look: { ...CLOCK_LOOKS[0].look, textSize: 24 } };
}

/** Changes a node's clock as one undo step. */
export function setClock(document: CanvasDocument, id: string, clock: Clock) {
  document.undo.stopCapturing();
  document.patch(id, { clock });
  document.undo.stopCapturing();
}

/** Whether the clock is counting: running, and not a timer that has already reached zero. */
export function isCounting(clock: Clock, now = Date.now()) {
  return isRunning(clock) && !isFinished(clock, now);
}

/** Pauses a counting clock; starts a stopped one, and a finished timer over from its length. */
export function toggleClock(document: CanvasDocument, item: Item) {
  if (!item.clock) return;
  const now = Date.now();
  const next = isCounting(item.clock, now)
    ? paused(item.clock, now)
    : started(paused(item.clock, now), now);
  setClock(document, item.id, next);
}

/** Switches what the clock is; a timer keeps the length it had, and the count starts over. */
export function changeClockKind(document: CanvasDocument, item: Item, kind: ClockKind) {
  if (!item.clock || item.clock.kind === kind) return;
  setClock(document, item.id, newClock(kind, item.clock.duration || undefined));
}

/** The selected clocks that count, which the time of day does not. */
const counting = ({ selected }: CommandContext) =>
  selected.filter((item) => item.clock && item.clock.kind !== "time");

export const CLOCK_COMMANDS: Command[] = [
  {
    id: "clock.toggle",
    label: (context) =>
      counting(context).some((item) => isCounting(item.clock!))
        ? "Pause the clock"
        : "Start the clock",
    help: "Start the selected stopwatch or timer for everyone in the room, or pause it.",
    group: "edit",
    keywords: ["timer", "stopwatch", "countdown", "stop", "resume"],
    when: (context) => counting(context).length > 0,
    run: (context) =>
      counting(context).forEach((item) => toggleClock(context.editor.document, item)),
  },
  {
    id: "clock.reset",
    label: "Reset the clock",
    help: "Stop the selected stopwatch or timer and return it to its beginning.",
    group: "edit",
    keywords: ["timer", "stopwatch", "countdown", "zero", "restart"],
    when: (context) => counting(context).length > 0,
    run: (context) =>
      counting(context).forEach((item) =>
        setClock(context.editor.document, item.id, reset(item.clock!))
      ),
  },
];
