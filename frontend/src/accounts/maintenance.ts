import type { TenantUser } from "./auth0Management";
import { SIGNUP_LIMIT_PER_DAY } from "./signupLimit";

/** How long an account has to activate before it is removed. */
export const ACTIVATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MaintenanceDeps {
  now(): number;
  /** Arconis's users in the Auth0 tenant. */
  users(): AsyncIterable<TenantUser>;
  deleteUser(id: string): Promise<void>;
  publish(counts: { activated: number; created: number; pruned: number }): Promise<void>;
  alert(subject: string, message: string): Promise<void>;
}

/**
 * Runs daily: removes accounts never activated, then publishes how many accounts exist and how many
 * appeared in the last day. Sign-in refuses an account until its email is verified, so one removed
 * here never signed in and holds no data.
 */
export async function runMaintenance(deps: MaintenanceDeps) {
  const now = deps.now();
  const counts = { activated: 0, created: 0, pruned: 0 };
  const expired: string[] = [];
  for await (const user of deps.users()) {
    if (now - user.created < DAY_MS) counts.created++;
    if (user.verified) counts.activated++;
    else if (now - user.created >= ACTIVATION_DAYS * DAY_MS) expired.push(user.id);
  }
  // Deleting while paging through a search would shift the pages under it.
  for (const id of expired) {
    await deps.deleteUser(id);
    counts.pruned++;
  }
  await deps.publish(counts);
  // Reaching the limit means someone may have been turned away, which is worth a person looking at.
  if (counts.created >= SIGNUP_LIMIT_PER_DAY)
    await deps.alert(
      "Arconis sign-ups reached the daily limit",
      `${counts.created} accounts were created in the last day.`
    );
  return counts;
}
