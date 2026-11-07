import { expect, it, vi } from "vitest";
import type { TenantUser } from "./auth0Management";
import { ACTIVATION_DAYS, runMaintenance, type MaintenanceDeps } from "./maintenance";
import { SIGNUP_LIMIT_PER_DAY } from "./signupLimit";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function setup(list: TenantUser[]) {
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
const user = (id: string, verified: boolean, ageDays: number): TenantUser => ({
  id,
  verified,
  created: NOW - ageDays * DAY,
});

it("removes accounts never activated once their time is up, and no others", async () => {
  const deps = setup([
    user("auth0|old-unverified", false, ACTIVATION_DAYS),
    user("auth0|new-unverified", false, ACTIVATION_DAYS - 1),
    user("auth0|old-activated", true, 400),
  ]);
  const counts = await runMaintenance(deps);
  expect(deps.deleteUser.mock.calls).toEqual([["auth0|old-unverified"]]);
  expect(counts).toEqual({ activated: 1, created: 0, pruned: 1 });
});

it("publishes the day's new accounts and the activated total", async () => {
  const deps = setup([user("a", true, 0.5), user("b", false, 0.5), user("c", true, 3)]);
  await runMaintenance(deps);
  expect(deps.publish).toHaveBeenCalledWith({ activated: 2, created: 2, pruned: 0 });
  expect(deps.alert).not.toHaveBeenCalled();
});

it("alerts once a day of sign-ups reaches the limit, and not before", async () => {
  const accounts = (length: number) => Array.from({ length }, (_, i) => user(`u${i}`, false, 0));
  const below = setup(accounts(SIGNUP_LIMIT_PER_DAY - 1));
  await runMaintenance(below);
  expect(below.alert).not.toHaveBeenCalled();
  const reached = setup(accounts(SIGNUP_LIMIT_PER_DAY));
  await runMaintenance(reached);
  expect(reached.alert).toHaveBeenCalledOnce();
});
