import { UserManager, WebStorageStateStore } from "oidc-client-ts";

export interface AccountConfig {
  /** The Ahara Auth0 tenant's issuer, where accounts live. */
  authAuthority: string;
  authClientId: string;
  /** The accounts API, which access tokens are issued for. */
  authAudience: string;
  /** Auth0's sign-out, which returns to the site. */
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
    // offline_access gives a rotating refresh token, so a session outlives one access token.
    scope: "openid email profile offline_access",
    extraQueryParams: { audience: config.authAudience },
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
