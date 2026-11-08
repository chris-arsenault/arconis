import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RateLimitedWrite } from "./rateLimitedWrite";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});
afterEach(() => {
  vi.useRealTimers();
});

it("writes the first change at once, then only the latest change once per interval", () => {
  const written: number[] = [];
  const limiter = new RateLimitedWrite(100);
  limiter.schedule(() => written.push(1));
  expect(written).toEqual([1]);
  for (let step = 2; step <= 120; step++) {
    limiter.schedule(() => written.push(step));
    vi.advanceTimersByTime(1);
  }
  // A drag of 120 steps over 120ms writes far fewer times than it moved, and ends on its last step.
  expect(written.length).toBeLessThan(60);
  vi.advanceTimersByTime(100);
  expect(written.at(-1)).toBe(120);
});

it("flushes the pending write on demand and writes nothing more afterwards", () => {
  const written: string[] = [];
  const limiter = new RateLimitedWrite(100);
  limiter.schedule(() => written.push("first"));
  limiter.schedule(() => written.push("pending"));
  expect(written).toEqual(["first"]);
  limiter.flush();
  expect(written).toEqual(["first", "pending"]);
  vi.advanceTimersByTime(500);
  expect(written).toEqual(["first", "pending"]);
});
