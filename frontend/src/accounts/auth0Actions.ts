import { ARCONIS_CONNECTION } from "./auth0Management";

/**
 * The post-login Action, bundled on its own and deployed by Terraform (auth0.tf). Actions run for the
 * whole Ahara tenant, so it acts only on Arconis's connection.
 */

export const NOT_ACTIVATED =
  "Activate your Arconis account from the email we sent, then sign in again.";

interface LoginEvent {
  connection: { name: string };
  user: { email_verified?: boolean };
}

/** An account signs in only once its email is verified. */
export function refuseLogin(event: LoginEvent) {
  if (event.connection.name !== ARCONIS_CONNECTION) return null;
  return event.user.email_verified === true ? null : NOT_ACTIVATED;
}

export function onExecutePostLogin(
  event: LoginEvent,
  api: { access: { deny(reason: string): void } }
) {
  const refusal = refuseLogin(event);
  if (refusal) api.access.deny(refusal);
}
