import { expect, it, vi } from "vitest";
import {
  ACTIVATION_DAYS,
  runMaintenance,
  type MaintenanceDeps,
  type PoolUser,
} from "./maintenance";
import { SIGNUP_LIMIT_PER_DAY } from "./signupLimit";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function setup(list: PoolUser[]) {
  const deps = {
    now: () => NOW,
    users: async function* () {
      await Promise.resolve();
      yield* list;
    },
    deleteUser: vi.fn(() => Promise.resolve()),
    publish: vi.fn(() => Promise.resolve()),
    alert: vi.fn(() => Promise.resolve()),
  } satisfies MaintenanceDeps;
  return deps;
}
const user = (username: string, status: string, ageDays: number): PoolUser => ({
  username,
  status,
  created: NOW - ageDays * DAY,
});

it("removes accounts never activated once their time is up, and no others", async () => {
  const deps = setup([
    user("old-unconfirmed", "UNCONFIRMED", ACTIVATION_DAYS),
    user("new-unconfirmed", "UNCONFIRMED", ACTIVATION_DAYS - 1),
    user("old-activated", "CONFIRMED", 400),
    user("resetting", "RESET_REQUIRED", 400),
  ]);
  const counts = await runMaintenance(deps);
  expect(deps.deleteUser.mock.calls).toEqual([["old-unconfirmed"]]);
  expect(counts).toEqual({ activated: 1, created: 0, pruned: 1 });
});

it("publishes the day's new accounts and the activated total", async () => {
  const deps = setup([
    user("a", "CONFIRMED", 0.5),
    user("b", "UNCONFIRMED", 0.5),
    user("c", "CONFIRMED", 3),
  ]);
  await runMaintenance(deps);
  expect(deps.publish).toHaveBeenCalledWith({ activated: 2, created: 2, pruned: 0 });
  expect(deps.alert).not.toHaveBeenCalled();
});

it("alerts once a day of sign-ups reaches the limit, and not before", async () => {
  const accounts = (length: number) =>
    Array.from({ length }, (_, i) => user(`u${i}`, "UNCONFIRMED", 0));
  const below = setup(accounts(SIGNUP_LIMIT_PER_DAY - 1));
  await runMaintenance(below);
  expect(below.alert).not.toHaveBeenCalled();
  const reached = setup(accounts(SIGNUP_LIMIT_PER_DAY));
  await runMaintenance(reached);
  expect(reached.alert).toHaveBeenCalledOnce();
});
