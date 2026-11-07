import { expect, it, vi } from "vitest";
import {
  SIGNUPS_FULL,
  SIGNUPS_UNAVAILABLE,
  SIGNUP_LIMIT_PER_DAY,
  signupRefusal,
  type SignupLimitDeps,
} from "./signupLimit";

const MIDDAY = Date.UTC(2026, 10, 7, 12);
const DAY = 24 * 60 * 60 * 1000;

/** Accounts created at these times, counted as the tenant's user search counts them. */
function tenant(created: number[], now = MIDDAY) {
  const clock = { now };
  const deps: SignupLimitDeps = {
    now: () => clock.now,
    createdSince: (time) => Promise.resolve(created.filter((at) => at >= time).length),
  };
  return { clock, deps };
}

it("admits sign-ups until the day's limit, then refuses with a readable reason", async () => {
  const below = tenant(Array.from({ length: SIGNUP_LIMIT_PER_DAY - 1 }, () => MIDDAY - 1000));
  await expect(signupRefusal(below.deps)).resolves.toBeNull();
  const full = tenant(Array.from({ length: SIGNUP_LIMIT_PER_DAY }, () => MIDDAY - 1000));
  await expect(signupRefusal(full.deps)).resolves.toBe(SIGNUPS_FULL);
});

it("counts from the start of the UTC day, so it opens again the next day", async () => {
  const { clock, deps } = tenant(Array.from({ length: SIGNUP_LIMIT_PER_DAY }, () => MIDDAY));
  await expect(signupRefusal(deps)).resolves.toBe(SIGNUPS_FULL);
  clock.now += DAY;
  await expect(signupRefusal(deps)).resolves.toBeNull();
});

it("refuses when the count cannot be read, without showing why", async () => {
  vi.spyOn(console, "error").mockImplementationOnce(() => {});
  const deps: SignupLimitDeps = {
    now: () => MIDDAY,
    createdSince: () => Promise.reject(new Error("tenant detail")),
  };
  await expect(signupRefusal(deps)).resolves.toBe(SIGNUPS_UNAVAILABLE);
});
