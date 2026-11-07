import { AccountStore } from "./accountStore";
import { oidcAuth, type AccountConfig } from "./auth";

/** The account service, or null where none is configured, such as local development. */
export function createAccount() {
  const config = window.__APP_CONFIG__ as Partial<AccountConfig> | undefined;
  if (!config?.authAuthority || !config.authClientId || !config.authSignOutUrl || !config.relayUrl)
    return null;
  return new AccountStore(oidcAuth(config as AccountConfig), config.relayUrl);
}
