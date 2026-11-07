import { UserManager, WebStorageStateStore } from "oidc-client-ts";

export interface AccountConfig {
  /** The user pool's issuer. The pool federates the Ahara Auth0 tenant, where accounts live. */
  authAuthority: string;
  authClientId: string;
  /** Where signing out goes: the pool's sign-out, which then signs out of Auth0. */
  authSignOutUrl: string;
  /** Where the accounts API is reached. */
  relayUrl: string;
}

/** What the account needs from sign-in. Signing in, signing up and activation happen at Auth0. */
export interface Auth {
  /** Finishes a sign-in the browser has just come back from, if it has. */
  completeSignIn(): Promise<void>;
  /** Leaves for the sign-in page, which also creates accounts. */
  signIn(): Promise<void>;
  /** A current access token, refreshed if needed, or null when signed out. */
  token(): Promise<string | null>;
  email(): Promise<string | null>;
  signOut(): Promise<void>;
}

/** The pool sends sign-in straight on to this identity provider (accounts.tf). */
const IDENTITY_PROVIDER = "Auth0";

interface ReturnState {
  hash: string;
}

/** Why sign-in came back without a sign-in, in the person's terms. */
export function signInFailure(params: URLSearchParams) {
  const reason = params.get("error_description") ?? params.get("error");
  return reason ? new Error(reason) : null;
}

export function oidcAuth(config: AccountConfig): Auth {
  const home = `${location.origin}/`;
  const users = new UserManager({
    authority: config.authAuthority,
    client_id: config.authClientId,
    redirect_uri: home,
    response_type: "code",
    scope: "openid email profile",
    extraQueryParams: { identity_provider: IDENTITY_PROVIDER },
    userStore: new WebStorageStateStore({ store: localStorage }),
    automaticSilentRenew: false,
    loadUserInfo: false,
  });
  const current = async () => {
    const user = await users.getUser();
    if (!user) return null;
    if (!user.expired) return user;
    try {
      return await users.signinSilent();
    } catch {
      await users.removeUser();
      return null;
    }
  };
  return {
    completeSignIn: async () => {
      const params = new URLSearchParams(location.search);
      if (!params.has("state")) return;
      // Leave the sign-in's parameters out of the address the person sees.
      const failure = signInFailure(params);
      history.replaceState(null, "", `${home}${location.hash}`);
      if (failure) throw failure;
      const user = await users.signinRedirectCallback(`${home}?${params}`);
      const state = user.state as ReturnState | undefined;
      if (state?.hash) location.hash = state.hash;
    },
    signIn: () => users.signinRedirect({ state: { hash: location.hash } satisfies ReturnState }),
    token: async () => (await current())?.access_token ?? null,
    email: async () => {
      const email = (await users.getUser())?.profile.email;
      return typeof email === "string" ? email : null;
    },
    signOut: async () => {
      await users.removeUser();
      location.assign(config.authSignOutUrl);
    },
  };
}
