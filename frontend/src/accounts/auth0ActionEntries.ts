import { refuseLogin, refuseSignup } from "./auth0Actions";
import { managementFromEnvironment } from "./auth0Management";

/** The Actions' entry points, each bundled to its own file that Terraform deploys (auth0.tf). */

interface Access {
  access: { deny(reason: string, userMessage?: string): void };
}

export async function onExecutePreUserRegistration(
  event: { connection: { name: string }; secrets: Record<string, string> },
  api: Access
) {
  const refusal = await refuseSignup(event, managementFromEnvironment(event.secrets), Date.now());
  if (refusal) api.access.deny("signup_limit", refusal);
}

export function onExecutePostLogin(
  event: { connection: { name: string }; user: { email_verified?: boolean } },
  api: Access
) {
  const refusal = refuseLogin(event);
  if (refusal) api.access.deny(refusal);
}
