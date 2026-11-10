/** Arconis's own users in the shared Ahara tenant (infrastructure/terraform/auth0.tf). */
export interface ManagementConfig {
  /** The tenant's own domain, which answers the Management API. */
  domain: string;
  clientId: string;
  clientSecret: string;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Deletes an account's Auth0 user through the Management API. */
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

  return {
    async deleteUser(id: string) {
      await call(`users/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

export function managementFromEnvironment(env: Record<string, string | undefined>) {
  return auth0Management({
    domain: env.AUTH0_DOMAIN ?? "",
    clientId: env.AUTH0_CLIENT_ID ?? "",
    clientSecret: env.AUTH0_CLIENT_SECRET ?? "",
  });
}
