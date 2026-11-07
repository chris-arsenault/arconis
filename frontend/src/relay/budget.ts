/** What this tool costs, computed from its own usage rather than the shared account's bill. */

export const MONTHLY_LIMIT_DOLLARS = 10;
export const ALERT_FRACTION = 0.8;
/** c7g.medium on demand in us-east-1. */
export const INSTANCE_DOLLARS_PER_HOUR = 0.0361;
/** 8 GB of gp3, which exists only while an instance does. */
export const DISK_DOLLARS_PER_HOUR = 0.00088;
/** Internet transfer plus the shared ALB's processing, rounded up. */
export const DOLLARS_PER_GB = 0.1;

export interface Usage {
  hours: number;
  gigabytes: number;
}

export function monthlySpend({ hours, gigabytes }: Usage) {
  return hours * (INSTANCE_DOLLARS_PER_HOUR + DISK_DOLLARS_PER_HOUR) + gigabytes * DOLLARS_PER_GB;
}

/** `2026-11` for any moment in that UTC month. */
export function monthOf(date: Date) {
  return date.toISOString().slice(0, 7);
}

/**
 * The owner re-enables the relay within a month by setting a parameter to `2026-11=25`.
 * It lapses by itself when the month ends, which is the automatic monthly re-enable.
 */
export function limitFor(month: string, override: string) {
  const [overrideMonth, dollars] = override.split("=");
  const raised = Number(dollars);
  return overrideMonth === month && raised > 0 ? raised : MONTHLY_LIMIT_DOLLARS;
}
