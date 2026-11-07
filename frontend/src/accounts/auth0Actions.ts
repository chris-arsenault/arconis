import { ARCONIS_CONNECTION, arconisUsers, type Auth0Management } from "./auth0Management";
import { signupRefusal } from "./signupLimit";

/**
 * Auth0 Actions run for the whole Ahara tenant, so each acts only on Arconis's connection. These
 * are the decisions; the bundled entry points in `auth0ActionEntries.ts` give them the tenant.
 */

export const NOT_ACTIVATED =
  "Activate your Arconis account from the email we sent, then sign in again.";

interface Connection {
  connection: { name: string };
}

/** Pre-user-registration: holds sign-ups to the day's limit. */
export async function refuseSignup(event: Connection, management: Auth0Management, now: number) {
  if (event.connection.name !== ARCONIS_CONNECTION) return null;
  return signupRefusal({
    now: () => now,
    createdSince: (time) => management.count(arconisUsers(time)),
  });
}

/** Post-login: an account signs in only once its email is verified. */
export function refuseLogin(event: Connection & { user: { email_verified?: boolean } }) {
  if (event.connection.name !== ARCONIS_CONNECTION) return null;
  return event.user.email_verified === true ? null : NOT_ACTIVATED;
}
