import { describe, expect, it, vi } from "vitest";
import {
  DISK_DOLLARS_PER_MONTH,
  INSTANCE_DOLLARS_PER_HOUR,
  limitFor,
  monthlySpend,
} from "./budget";
import { RelayControl, SPEND_CACHE_MS, type ControlDeps, type InstanceState } from "./control";

const NOW = new Date("2026-11-15T12:00:00Z");

function setup({
  state = "stopped" as InstanceState,
  dollars = 1,
  override = "none",
  lastAlert = "none",
} = {}) {
  let time = NOW;
  const hours = (dollars - DISK_DOLLARS_PER_MONTH) / INSTANCE_DOLLARS_PER_HOUR;
  const deps = {
    now: () => time,
    instanceState: vi.fn(() => Promise.resolve(state)),
    startInstance: vi.fn(() => Promise.resolve()),
    stopInstance: vi.fn(() => Promise.resolve()),
    usage: vi.fn(() => Promise.resolve({ hours, gigabytes: 0 })),
    override: vi.fn(() => Promise.resolve(override)),
    lastAlert: vi.fn(() => Promise.resolve(lastAlert)),
    recordAlert: vi.fn(() => Promise.resolve()),
    alert: vi.fn(() => Promise.resolve()),
  } satisfies ControlDeps;
  return {
    deps,
    control: new RelayControl(deps),
    advance: (ms: number) => {
      time = new Date(time.getTime() + ms);
    },
  };
}

describe("starting", () => {
  it("starts a stopped relay under the limit", async () => {
    const { control, deps } = setup();
    expect(await control.start()).toBe("starting");
    expect(deps.startInstance).toHaveBeenCalledOnce();
  });

  it.each([
    ["running", "running"],
    ["pending", "starting"],
    ["stopping", "stopping"],
  ] as const)("leaves a %s instance alone", async (state, status) => {
    const { control, deps } = setup({ state });
    expect(await control.start()).toBe(status);
    expect(deps.startInstance).not.toHaveBeenCalled();
  });

  it("measures usage from the start of the month", async () => {
    const { control, deps } = setup();
    await control.status();
    expect(deps.usage).toHaveBeenCalledWith(new Date("2026-11-01T00:00:00Z"), NOW);
  });
});

describe("reading status", () => {
  it("never starts anything", async () => {
    const { control, deps } = setup();
    expect(await control.status()).toBe("stopped");
    expect(deps.startInstance).not.toHaveBeenCalled();
  });
});

describe("the hard stop", () => {
  it("refuses to start at the limit, whoever asks", async () => {
    const { control, deps } = setup({ dollars: 10 });
    expect(await control.start()).toBe("limit");
    expect(deps.startInstance).not.toHaveBeenCalled();
  });

  it.each(["running", "pending"] as const)("stops a %s instance past the limit", async (state) => {
    const { control, deps } = setup({ state, dollars: 11 });
    expect(await control.status()).toBe("limit");
    expect(deps.stopInstance).toHaveBeenCalledOnce();
  });

  it("re-enables by itself in a new month, because usage is counted per month", async () => {
    const { control } = setup({ dollars: 1, override: "2026-10=25" });
    expect(await control.start()).toBe("starting");
  });

  it("re-enables manually through a limit for this month", async () => {
    const { control } = setup({ dollars: 12, override: "2026-11=25" });
    expect(await control.start()).toBe("starting");
  });

  it("ignores a raised limit from an earlier month", () => {
    expect(limitFor("2026-11", "2026-10=25")).toBe(10);
    expect(limitFor("2026-11", "2026-11=25")).toBe(25);
    expect(limitFor("2026-11", "2026-11=nonsense")).toBe(10);
  });

  it("keeps reads of spend to one per cache period under hostile traffic", async () => {
    const { control, deps, advance } = setup();
    for (let index = 0; index < 50; index++) await control.status();
    expect(deps.usage).toHaveBeenCalledOnce();
    advance(SPEND_CACHE_MS);
    await control.status();
    expect(deps.usage).toHaveBeenCalledTimes(2);
  });

  it("counts hours and transfer", () => {
    expect(monthlySpend({ hours: 0, gigabytes: 0 })).toBe(DISK_DOLLARS_PER_MONTH);
    expect(monthlySpend({ hours: 50, gigabytes: 16 })).toBeCloseTo(4.05);
  });
});

describe("alerts", () => {
  it("stays quiet below the warning level", async () => {
    const { control, deps } = setup({ dollars: 7.9 });
    await control.status();
    expect(deps.alert).not.toHaveBeenCalled();
  });

  it("warns once as usage approaches the limit", async () => {
    const { control, deps } = setup({ dollars: 8.5 });
    await control.status();
    expect(deps.alert).toHaveBeenCalledOnce();
    expect(deps.recordAlert).toHaveBeenCalledWith("2026-11:warn");
  });

  it("does not repeat a warning already sent this month", async () => {
    const { control, deps } = setup({ dollars: 8.5, lastAlert: "2026-11:warn" });
    await control.status();
    expect(deps.alert).not.toHaveBeenCalled();
  });

  it("warns again in a new month", async () => {
    const { control, deps } = setup({ dollars: 8.5, lastAlert: "2026-10:limit" });
    await control.status();
    expect(deps.alert).toHaveBeenCalledOnce();
  });

  it("still alerts at the limit after the warning", async () => {
    const { control, deps } = setup({ dollars: 10, lastAlert: "2026-11:warn" });
    await control.status();
    expect(deps.alert).toHaveBeenCalledOnce();
    expect(deps.recordAlert).toHaveBeenCalledWith("2026-11:limit");
  });
});
