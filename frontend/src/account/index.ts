import { AccountStore } from "./accountStore";
import { oidcAuth, type AccountConfig } from "./auth";

const REQUIRED: (keyof AccountConfig)[] = [
  "authAuthority",
  "authClientId",
  "authAudience",
  "authSignOutUrl",
  "relayUrl",
];

/** The account service, or null where none is configured, such as local development. */
export function createAccount() {
  const config = window.__APP_CONFIG__ as Partial<AccountConfig> | undefined;
  if (!config || !REQUIRED.every((key) => config[key])) return null;
  const complete = config as AccountConfig;
  return new AccountStore(oidcAuth(complete), complete.relayUrl);
}
