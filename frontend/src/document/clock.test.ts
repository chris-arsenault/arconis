import { expect, it } from "vitest";
import {
  clockText,
  formatSeconds,
  isFinished,
  isRunning,
  newClock,
  paused,
  readClock,
  readDuration,
  reset,
  started,
} from "./clock";

const T0 = 1_700_000_000_000;

it("counts a stopwatch up across pauses", () => {
  let clock = newClock("stopwatch");
  expect(clockText(clock, T0)).toBe("0:00");
  clock = started(clock, T0);
  expect(isRunning(clock)).toBe(true);
  expect(clockText(clock, T0 + 65_400)).toBe("1:05");
  clock = paused(clock, T0 + 65_400);
  expect(isRunning(clock)).toBe(false);
  // Time that passes while paused is not counted.
  expect(clockText(clock, T0 + 900_000)).toBe("1:05");
  clock = started(clock, T0 + 900_000);
  expect(clockText(clock, T0 + 900_000 + 3_600_000)).toBe("1:01:05");
  expect(clockText(reset(clock), T0)).toBe("0:00");
});

it("counts a timer down to zero and stops there", () => {
  let clock = newClock("timer", 90);
  expect(clockText(clock, T0)).toBe("1:30");
  clock = started(clock, T0);
  expect(clockText(clock, T0 + 500)).toBe("1:30");
  expect(clockText(clock, T0 + 1_000)).toBe("1:29");
  expect(clockText(clock, T0 + 89_500)).toBe("0:01");
  expect(isFinished(clock, T0 + 89_500)).toBe(false);
  expect(clockText(clock, T0 + 90_000)).toBe("0:00");
  expect(clockText(clock, T0 + 500_000)).toBe("0:00");
  expect(isFinished(clock, T0 + 500_000)).toBe(true);
  // Pausing after the end holds zero, and starting again begins a fresh countdown.
  clock = paused(clock, T0 + 500_000);
  expect(clock.elapsed).toBe(90);
  clock = started(clock, T0 + 600_000);
  expect(clockText(clock, T0 + 601_000)).toBe("1:29");
});

it("reads the time of day from the reader's own clock", () => {
  const clock = newClock("time");
  const now = new Date(2026, 10, 11, 9, 5, 7).getTime();
  expect(clockText(clock, now)).toBe("09:05:07");
  expect(isRunning(clock)).toBe(true);
  expect(started(clock, now)).toBe(clock);
});

it("formats and reads lengths of time", () => {
  expect(formatSeconds(0)).toBe("0:00");
  expect(formatSeconds(3599)).toBe("59:59");
  expect(formatSeconds(3600)).toBe("1:00:00");
  expect(readDuration("90")).toBe(90);
  expect(readDuration("5:00")).toBe(300);
  expect(readDuration("1:02:03")).toBe(3723);
  for (const wrong of ["", "0", "0:00", "five", "1:2:3:4", "-5", "1.5"])
    expect(readDuration(wrong)).toBeNull();
});

it("accepts only a well-formed clock from a peer", () => {
  expect(readClock({ kind: "timer", duration: 60, started: 0, elapsed: 5 })).toEqual({
    kind: "timer",
    duration: 60,
    started: 0,
    elapsed: 5,
  });
  for (const wrong of [null, "timer", {}, { kind: "sundial", duration: 0, started: 0, elapsed: 0 }])
    expect(readClock(wrong)).toBeNull();
  expect(readClock({ kind: "timer", duration: -1, started: 0, elapsed: 0 })).toBeNull();
});
