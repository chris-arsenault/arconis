import { createRemoteJWKSet, jwtVerify } from "jose";
import type { McpConfig, TokenVerifier } from "./mcpHttp";

/**
 * Accepts only access tokens the Ahara Auth0 tenant issued for this MCP endpoint. Auth0 puts the
 * requested resource in `aud`, so a token meant for any other API is refused.
 */
export function accessTokenVerifier(config: McpConfig): TokenVerifier {
  const keys = createRemoteJWKSet(new URL(".well-known/jwks.json", config.issuer));
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.resource,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string") return null;
    const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
    const clientId = typeof payload.azp === "string" ? payload.azp : "";
    return { user: payload.sub, clientId, scopes };
  };
}
