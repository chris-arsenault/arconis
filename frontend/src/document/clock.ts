/**
 * A clock on the canvas: the time of day, a stopwatch or a countdown. The document holds only what
 * kind it is and when it was started; each person's browser works out the numbers from its own
 * clock, so readings agree to within the difference between people's clocks.
 */

export const CLOCK_KINDS = ["time", "stopwatch", "timer"] as const;
export type ClockKind = (typeof CLOCK_KINDS)[number];

export interface Clock {
  kind: ClockKind;
  /** A timer's length in seconds; unused by the other kinds. */
  duration: number;
  /** When the current run began, in milliseconds since the epoch; 0 while stopped. */
  started: number;
  /** Seconds counted in earlier runs, before `started`. */
  elapsed: number;
}

export const DEFAULT_TIMER_SECONDS = 300;

export function newClock(kind: ClockKind, duration = DEFAULT_TIMER_SECONDS): Clock {
  return { kind, duration: kind === "timer" ? duration : 0, started: 0, elapsed: 0 };
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** A clock as a peer or a file gave it, or null when it is not one. */
export function readClock(value: unknown): Clock | null {
  if (!value || typeof value !== "object") return null;
  const { kind, duration, started, elapsed } = value as Record<string, unknown>;
  if (!CLOCK_KINDS.includes(kind as ClockKind)) return null;
  if (!isCount(duration) || !isCount(started) || !isCount(elapsed)) return null;
  return { kind: kind as ClockKind, duration, started, elapsed };
}

export const isRunning = (clock: Clock) => clock.kind === "time" || clock.started > 0;

/** Seconds counted so far, including the run in progress. */
export function elapsedSeconds(clock: Clock, now: number) {
  const running = clock.started > 0 ? Math.max(0, now - clock.started) / 1000 : 0;
  return clock.elapsed + running;
}

/** Whether a timer has reached zero. */
export function isFinished(clock: Clock, now: number) {
  return clock.kind === "timer" && elapsedSeconds(clock, now) >= clock.duration;
}

/** The clock running from `now`; a finished timer starts over. */
export function started(clock: Clock, now: number): Clock {
  if (clock.kind === "time" || clock.started > 0) return clock;
  const elapsed = isFinished(clock, now) ? 0 : clock.elapsed;
  return { ...clock, started: now, elapsed };
}

/** The clock stopped at `now`, keeping what it has counted. */
export function paused(clock: Clock, now: number): Clock {
  if (clock.started === 0) return clock;
  const counted = elapsedSeconds(clock, now);
  const elapsed = clock.kind === "timer" ? Math.min(counted, clock.duration) : counted;
  return { ...clock, started: 0, elapsed };
}

/** The clock stopped at its beginning. */
export function reset(clock: Clock): Clock {
  return { ...clock, started: 0, elapsed: 0 };
}

const two = (value: number) => String(value).padStart(2, "0");

/** Seconds as m:ss, or h:mm:ss from an hour up. */
export function formatSeconds(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = two(whole % 60);
  return hours ? `${hours}:${two(minutes)}:${rest}` : `${minutes}:${rest}`;
}

/** A length typed as seconds, m:ss or h:mm:ss, in seconds; null when it is none of those. */
export function readDuration(text: string) {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d{1,6}$/.test(part))) return null;
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return seconds > 0 ? seconds : null;
}

/** What the clock reads at `now`. The time of day is in the reader's own time zone. */
export function clockText(clock: Clock, now: number) {
  if (clock.kind === "time") {
    const date = new Date(now);
    return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  }
  const counted = elapsedSeconds(clock, now);
  if (clock.kind === "stopwatch") return formatSeconds(counted);
  // A countdown shows a second until that second has wholly passed, and 0:00 only at the end.
  return formatSeconds(Math.ceil(Math.max(0, clock.duration - counted)));
}
