import { expect, it, vi } from "vitest";
import {
  SIGNUPS_FULL,
  SIGNUPS_UNAVAILABLE,
  SIGNUP_LIMIT_PER_DAY,
  admitSignup,
  type SignupLimitDeps,
} from "./signupLimit";

const SIGN_UP = { triggerSource: "PreSignUp_SignUp" };
const MIDDAY = Date.UTC(2026, 10, 7, 12);
const DAY = 24 * 60 * 60 * 1000;

/** Places counted per day, as the table's conditional update counts them. */
function counter(start = MIDDAY) {
  const days = new Map<string, number>();
  const clock = { now: start };
  const deps: SignupLimitDeps = {
    now: () => clock.now,
    claim: (day, limit) => {
      const used = days.get(day) ?? 0;
      if (used >= limit) return Promise.resolve(false);
      days.set(day, used + 1);
      return Promise.resolve(true);
    },
  };
  return { clock, deps };
}

it("admits the day's limit and refuses the next person with a readable reason", async () => {
  const { deps } = counter();
  for (let i = 0; i < SIGNUP_LIMIT_PER_DAY; i++)
    await expect(admitSignup(SIGN_UP, deps)).resolves.toBe(SIGN_UP);
  await expect(admitSignup(SIGN_UP, deps)).rejects.toThrow(SIGNUPS_FULL);
});

it("opens again on the next UTC day", async () => {
  const { clock, deps } = counter();
  for (let i = 0; i < SIGNUP_LIMIT_PER_DAY; i++) await admitSignup(SIGN_UP, deps);
  clock.now += DAY;
  await expect(admitSignup(SIGN_UP, deps)).resolves.toBe(SIGN_UP);
});

it("refuses when the count cannot be read, without showing why", async () => {
  vi.spyOn(console, "error").mockImplementationOnce(() => {});
  const deps: SignupLimitDeps = {
    now: () => MIDDAY,
    claim: () => Promise.reject(new Error("table detail")),
  };
  await expect(admitSignup(SIGN_UP, deps)).rejects.toThrow(SIGNUPS_UNAVAILABLE);
});

it("leaves accounts an administrator creates uncounted", async () => {
  const claim = vi.fn(() => Promise.resolve(true));
  const event = { triggerSource: "PreSignUp_AdminCreateUser" };
  await expect(admitSignup(event, { now: () => MIDDAY, claim })).resolves.toBe(event);
  expect(claim).not.toHaveBeenCalled();
});
