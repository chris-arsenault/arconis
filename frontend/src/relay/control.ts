import type { RelayStatus } from "../collaboration/serviceProtocol";
import { ALERT_FRACTION, limitFor, monthOf, monthlySpend, type Usage } from "./budget";

/** How long a spend figure is reused. Its source lags by minutes, and each read costs a little. */
export const SPEND_CACHE_MS = 5 * 60_000;

export type InstanceState = "pending" | "running" | "stopping" | "stopped";

/**
 * The relay's state, from its Auto Scaling group. Scaling to zero is how it stops, because a group
 * replaces an instance that merely shuts down. During a rollout, a healthy old instance counts as up.
 */
export function capacityState(desired: number, lifecycles: string[]): InstanceState {
  if (desired === 0) return lifecycles.length ? "stopping" : "stopped";
  return lifecycles.includes("InService") ? "running" : "pending";
}

export interface ControlDeps {
  now(): Date;
  instanceState(): Promise<InstanceState>;
  startInstance(): Promise<void>;
  stopInstance(): Promise<void>;
  usage(from: Date, to: Date): Promise<Usage>;
  /** The owner's month-scoped limit, such as `2026-11=25`. */
  override(): Promise<string>;
  /** The last alert sent, such as `2026-11:warn`. */
  lastAlert(): Promise<string>;
  recordAlert(value: string): Promise<void>;
  alert(subject: string, message: string): Promise<void>;
}

type AlertLevel = "warn" | "limit";
const ALERT_RANK: Record<string, number> = { warn: 1, limit: 2 };

const RUNNING_STATES = new Set<InstanceState>(["pending", "running"]);

export class RelayControl {
  private cached: { until: number; overLimit: boolean } | null = null;

  constructor(private deps: ControlDeps) {}

  /** Answers whether the relay is up. Reading it never starts anything. */
  async status(): Promise<RelayStatus> {
    const state = await this.deps.instanceState();
    if (await this.overLimit()) {
      if (RUNNING_STATES.has(state)) await this.deps.stopInstance();
      return "limit";
    }
    return describe(state);
  }

  /** Starts the relay unless the month's limit has been reached. */
  async start(): Promise<RelayStatus> {
    const status = await this.status();
    if (status !== "stopped") return status;
    await this.deps.startInstance();
    return "starting";
  }

  private async overLimit() {
    const time = this.deps.now();
    if (this.cached && time.getTime() < this.cached.until) return this.cached.overLimit;
    const overLimit = await this.measure(time);
    this.cached = { until: time.getTime() + SPEND_CACHE_MS, overLimit };
    return overLimit;
  }

  private async measure(time: Date) {
    const month = monthOf(time);
    const from = new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), 1));
    const [usage, override] = await Promise.all([
      this.deps.usage(from, time),
      this.deps.override(),
    ]);
    const spend = monthlySpend(usage);
    const limit = limitFor(month, override);
    if (spend >= limit) await this.alertOnce(month, "limit", spend, limit);
    else if (spend >= limit * ALERT_FRACTION) await this.alertOnce(month, "warn", spend, limit);
    return spend >= limit;
  }

  private async alertOnce(month: string, level: AlertLevel, spend: number, limit: number) {
    const [lastMonth, lastLevel] = (await this.deps.lastAlert()).split(":");
    if (lastMonth === month && ALERT_RANK[lastLevel] >= ALERT_RANK[level]) return;
    const amount = `$${spend.toFixed(2)} of $${limit.toFixed(2)}`;
    await this.deps.alert(
      level === "limit" ? "Arconis relay stopped at its limit" : "Arconis relay near its limit",
      level === "limit"
        ? `The relay has used ${amount} for ${month} and will stay off until next month.`
        : `The relay has used ${amount} for ${month}.`
    );
    await this.deps.recordAlert(`${month}:${level}`);
  }
}

function describe(state: InstanceState): RelayStatus {
  if (state === "running") return "running";
  if (state === "pending") return "starting";
  if (state === "stopped") return "stopped";
  return "stopping";
}
