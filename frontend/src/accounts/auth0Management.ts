/** Arconis's own users in the shared Ahara tenant (infrastructure/terraform/auth0.tf). */
export const ARCONIS_CONNECTION = "arconis";

export interface ManagementConfig {
  /** The tenant's own domain, which answers the Management API. */
  domain: string;
  clientId: string;
  clientSecret: string;
}

export interface TenantUser {
  id: string;
  verified: boolean;
  created: number;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface UserPage {
  users: { user_id: string; email_verified?: boolean; created_at: string }[];
  total: number;
}

const PAGE_SIZE = 100;

/** Lucene for Arconis's users, optionally only those created at or after a time. */
export function arconisUsers(since?: number) {
  const connection = `identities.connection:"${ARCONIS_CONNECTION}"`;
  return since === undefined
    ? connection
    : `${connection} AND created_at:[${new Date(since).toISOString()} TO *]`;
}

/**
 * The few Management API calls the account lifecycle makes. User search reads an index that trails
 * writes by moments, so counts are close rather than exact.
 */
export function auth0Management(config: ManagementConfig, request: Fetcher = fetch) {
  const base = `https://${config.domain}`;
  let token: { value: string; until: number } | null = null;

  async function accessToken() {
    if (token && Date.now() < token.until) return token.value;
    const response = await request(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: `${base}/api/v2/`,
      }),
    });
    if (!response.ok) throw new Error(`Auth0 refused the token request: ${response.status}`);
    const { access_token, expires_in } = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    token = { value: access_token, until: Date.now() + (expires_in - 60) * 1000 };
    return access_token;
  }

  async function call(path: string, init: RequestInit = {}) {
    const response = await request(`${base}/api/v2/${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    if (!response.ok && response.status !== 404)
      throw new Error(`Auth0 refused ${init.method ?? "GET"} ${path}: ${response.status}`);
    return response;
  }

  async function search(query: string, page: number, perPage: number) {
    const params = new URLSearchParams({
      q: query,
      search_engine: "v3",
      include_totals: "true",
      fields: "user_id,email_verified,created_at",
      page: String(page),
      per_page: String(perPage),
    });
    return (await (await call(`users?${params}`)).json()) as UserPage;
  }

  return {
    async count(query: string) {
      return (await search(query, 0, 1)).total;
    },
    async *users(query: string): AsyncIterable<TenantUser> {
      for (let page = 0, seen = 0; ; page++) {
        const result = await search(query, page, PAGE_SIZE);
        for (const user of result.users)
          yield {
            id: user.user_id,
            verified: user.email_verified === true,
            created: Date.parse(user.created_at),
          };
        seen += result.users.length;
        if (!result.users.length || seen >= result.total) return;
      }
    },
    async deleteUser(id: string) {
      await call(`users/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export type Auth0Management = ReturnType<typeof auth0Management>;

/** The Auth0 user a federated pool user came from, from the pool's `identities` attribute. */
export function federatedUserId(attributes: { Name?: string; Value?: string }[]) {
  const identities = attributes.find(({ Name }) => Name === "identities")?.Value;
  try {
    const parsed = JSON.parse(identities ?? "[]") as { userId?: unknown; providerName?: unknown }[];
    const auth0 = parsed.find(({ providerName }) => providerName === "Auth0");
    return typeof auth0?.userId === "string" ? auth0.userId : null;
  } catch {
    return null;
  }
}

export function managementFromEnvironment(env: Record<string, string | undefined>) {
  return auth0Management({
    domain: env.AUTH0_DOMAIN ?? "",
    clientId: env.AUTH0_CLIENT_ID ?? "",
    clientSecret: env.AUTH0_CLIENT_SECRET ?? "",
  });
}
