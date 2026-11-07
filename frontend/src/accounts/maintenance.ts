/** How long an account has to activate before it is removed. */
export const ACTIVATION_DAYS = 7;
/** More new accounts than this in a day is worth a person looking at. */
export const SIGNUP_ALERT_PER_DAY = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PoolUser {
  username: string;
  status: string;
  created: number;
}

export interface MaintenanceDeps {
  now(): number;
  users(): AsyncIterable<PoolUser>;
  deleteUser(username: string): Promise<void>;
  publish(counts: { activated: number; created: number; pruned: number }): Promise<void>;
  alert(subject: string, message: string): Promise<void>;
}

/**
 * Runs daily: removes accounts never activated, then publishes how many accounts exist and how many
 * appeared in the last day. Only unconfirmed accounts are ever removed, and they hold no data.
 */
export async function runMaintenance(deps: MaintenanceDeps) {
  const now = deps.now();
  const counts = { activated: 0, created: 0, pruned: 0 };
  for await (const user of deps.users()) {
    if (now - user.created < DAY_MS) counts.created++;
    if (user.status === "CONFIRMED") counts.activated++;
    else if (user.status === "UNCONFIRMED" && now - user.created >= ACTIVATION_DAYS * DAY_MS) {
      await deps.deleteUser(user.username);
      counts.pruned++;
    }
  }
  await deps.publish(counts);
  if (counts.created > SIGNUP_ALERT_PER_DAY)
    await deps.alert(
      "Arconis sign-ups are unusually high",
      `${counts.created} accounts were created in the last day.`
    );
  return counts;
}
