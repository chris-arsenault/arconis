import { expect, it, vi } from "vitest";
import { Relay, IDLE_NO_CONNECTIONS_MS } from "./relay";

it("retains seeded sessions without counting them as people, and preserves idle/budget controls", async () => {
  let now = 0;
  const stop = vi.fn();
  const withinBudget = vi.fn(() => Promise.resolve(true));
  const relay = new Relay({ now: () => now, stop, withinBudget, uploads: null });
  const release = relay.retainAgentRoom("seeded");
  now = IDLE_NO_CONNECTIONS_MS * 2;
  relay.tick();
  expect(stop).not.toHaveBeenCalled();
  expect(relay.connectionCount).toBe(0);
  expect(relay.peopleIn("seeded")).toBe(0);
  expect(withinBudget).toHaveBeenCalled();
  release();
  now += IDLE_NO_CONNECTIONS_MS + 1;
  relay.tick();
  expect(stop).toHaveBeenCalledWith("idle");

  const limited = new Relay({
    now: () => now,
    stop,
    withinBudget: () => Promise.resolve(false),
    uploads: null,
  });
  limited.retainAgentRoom("seeded");
  limited.tick();
  await expect.poll(() => stop.mock.calls.some(([reason]) => reason === "limit")).toBe(true);
});
