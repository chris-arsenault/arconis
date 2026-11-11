import { useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { EditorController } from "../editor/controller";
import {
  CLOCK_KINDS,
  formatSeconds,
  readDuration,
  reset,
  type Clock,
  type ClockKind,
} from "../document/clock";
import type { Item } from "../document/types";
import { CLOCK_LOOKS, changeClockKind, isCounting, setClock, toggleClock } from "../editor/clocks";
import { changeSelectionLook } from "../editor/commands";
import "./clock.css";

const KIND_NAMES: Record<ClockKind, string> = {
  time: "Clock",
  stopwatch: "Stopwatch",
  timer: "Timer",
};
const KIND_DETAILS: Record<ClockKind, string> = {
  time: "Show the time of day, in each person's own time zone.",
  stopwatch: "Count up from zero once started.",
  timer: "Count down from a set length to zero.",
};

/** A timer's length, typed as m:ss, h:mm:ss or plain seconds. */
function TimerLength({
  clock,
  onLength,
}: Readonly<{ clock: Clock; onLength: (seconds: number) => void }>) {
  const [typing, setTyping] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (typing === null) return;
    const seconds = readDuration(typing);
    setInvalid(seconds === null);
    if (seconds === null) return;
    if (seconds !== clock.duration) onLength(seconds);
    setTyping(null);
  };
  return (
    <label data-hint-detail="How long the timer counts down, as minutes:seconds such as 5:00, or seconds.">
      Length
      <input
        aria-label="Timer length"
        aria-invalid={invalid ? true : undefined}
        value={typing ?? formatSeconds(clock.duration)}
        onChange={(event) => setTyping(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setTyping(null);
        }}
      />
    </label>
  );
}

/** The selected clock's kind, length, running state and look. */
export function ClockControls({
  editor,
  item,
}: Readonly<{ editor: EditorController; item: Item }>) {
  const { clock } = item;
  if (!clock) return null;
  const { document } = editor;
  // A timer that has run out offers Start again; the ticker redraws the panel when it does.
  const running = isCounting(clock);
  return (
    <section className="clock-controls" aria-label="Clock">
      <div className="clock-kinds" role="radiogroup" aria-label="Kind of clock">
        {CLOCK_KINDS.map((kind) => (
          <label key={kind} data-hint-detail={KIND_DETAILS[kind]}>
            <input
              type="radio"
              name="clock-kind"
              checked={clock.kind === kind}
              onChange={() => changeClockKind(document, item, kind)}
            />
            <span>{KIND_NAMES[kind]}</span>
          </label>
        ))}
      </div>
      {clock.kind === "timer" && (
        <TimerLength
          key={clock.duration}
          clock={clock}
          onLength={(duration) => setClock(document, item.id, { ...reset(clock), duration })}
        />
      )}
      {clock.kind !== "time" && (
        <div className="clock-actions">
          <button
            className="primary"
            data-hint-detail="Start this clock for everyone in the room, or pause it where it is."
            onClick={() => toggleClock(document, item)}
          >
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? "Pause" : "Start"}
          </button>
          <button
            data-hint-detail="Stop this clock and return it to its beginning."
            onClick={() => setClock(document, item.id, reset(clock))}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      )}
      <div className="clock-looks" role="group" aria-label="Clock look">
        {CLOCK_LOOKS.map(({ id, label, look }) => (
          <button
            key={id}
            className={`clock-look clock-look-${id}`}
            data-hint-detail={`Give the clock its ${label.toLowerCase()} look; Appearance changes it further.`}
            onClick={() => changeSelectionLook(document, [item], look)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
