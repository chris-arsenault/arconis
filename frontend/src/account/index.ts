import { AccountStore, indexedDbKeyVault } from "./accountStore";
import { cognitoAuth, type AccountConfig } from "./auth";

/** The account service, or null where none is configured, such as local development. */
export function createAccount() {
  const config = window.__APP_CONFIG__ as Partial<AccountConfig> | undefined;
  if (!config?.cognitoUserPoolId || !config.cognitoClientId || !config.relayUrl) return null;
  const auth = cognitoAuth(config as AccountConfig);
  return new AccountStore(auth, indexedDbKeyVault(), config.relayUrl);
}
