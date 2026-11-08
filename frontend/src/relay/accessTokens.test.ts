import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from "jose";
import { afterAll, beforeAll, expect, it } from "vitest";
import { accessTokenVerifier } from "./accessTokens";

const RESOURCE = "https://relay.example/mcp";
let server: Server;
let issuer = "";
let key: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  server = createServer((request, response) => {
    if (request.url === "/.well-known/jwks.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const token = (claims: { iss?: string; aud?: string | string[]; sub?: string }) =>
  new SignJWT({ scope: "edit:rooms offline_access", azp: "tpc_claude" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud ?? [RESOURCE, `${issuer}userinfo`])
    .setSubject(claims.sub ?? "auth0|ada")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

it("accepts a token the tenant issued for this endpoint, as the person who signed in", async () => {
  const verify = accessTokenVerifier({ resource: RESOURCE, issuer });
  await expect(verify(await token({}))).resolves.toEqual({
    user: "auth0|ada",
    clientId: "tpc_claude",
    scopes: ["edit:rooms", "offline_access"],
  });
});

it("refuses a token meant for another API or from another issuer", async () => {
  const verify = accessTokenVerifier({ resource: RESOURCE, issuer });
  await expect(verify(await token({ aud: "https://other.example/api" }))).resolves.toBeNull();
  await expect(verify(await token({ iss: "https://elsewhere.example/" }))).resolves.toBeNull();
  await expect(verify("malformed")).resolves.toBeNull();
});

it("propagates an unavailable key service instead of treating it as an invalid bearer", async () => {
  const verify = accessTokenVerifier({ resource: RESOURCE, issuer: `${issuer}unavailable/` });
  await expect(verify(await token({}))).rejects.toThrow();
});
