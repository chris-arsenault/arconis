import { createRemoteJWKSet, jwtVerify } from "jose";
import type { McpConfig, TokenVerifier } from "./mcpHttp";

/**
 * Accepts only access tokens the user pool issued to the agents' app client. Cognito puts the
 * requested resource in `aud` when a client asks for one; a token bound elsewhere is refused.
 */
export function cognitoVerifier(config: McpConfig): TokenVerifier {
  const keys = createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`));
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, { issuer: config.issuer });
    if (payload.token_use !== "access" || payload.client_id !== config.clientId) return null;
    const audiences = typeof payload.aud === "string" ? [payload.aud] : (payload.aud ?? []);
    if (audiences.length && !audiences.includes(config.resource)) return null;
    if (typeof payload.sub !== "string") return null;
    const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
    return { user: payload.sub, clientId: config.clientId, scopes };
  };
}
