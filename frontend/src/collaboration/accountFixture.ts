import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AccountsApi, tokenSubject } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** A stand-in OIDC token. The real ALB validates tokens; this local fixture has nothing to check. */
function token(claims: object) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none" })}.${part({ iat: now, exp: now + 3600, ...claims })}.x`;
}

export const FIXTURE_CLIENT_ID = "fixture";

interface Grant {
  email: string;
  challenge: string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The stand-in for the hosted sign-in page: one email field, as if the password were accepted. */
function signInPage(query: URLSearchParams) {
  const hidden = ["redirect_uri", "state", "code_challenge"]
    .map((name) => `<input type="hidden" name="${name}" value="${escape(query.get(name) ?? "")}">`)
    .join("");
  return `<!doctype html><title>Sign in to Ahara</title><form method="post">${hidden}
<label>Email <input name="email" type="email" aria-label="Email"></label>
<button>Continue</button></form>`;
}

/**
 * Test-only: the real accounts API over memory, and a stand-in for the sign-in service the site
 * uses (Auth0 directly), so the real OIDC library runs unchanged. Passwords are
 * the one thing here that only real Auth0 checks.
 */
export function accountFixture(base: () => string) {
  const objects = new Map<string, Buffer>();
  const api = new AccountsApi(memoryAccountTable(), {
    objectInfo: (user, id) => {
      const bytes = objects.get(`/objects/${user}/${id}`);
      return Promise.resolve(
        bytes
          ? { size: bytes.length, checksum: createHash("sha256").update(bytes).digest("base64") }
          : null
      );
    },
    signUpload: (user, id) => Promise.resolve(`${base()}/objects/${user}/${id}`),
    signDownload: (user, id) => Promise.resolve(`${base()}/objects/${user}/${id}`),
    deleteObject: (user, id) => {
      objects.delete(`/objects/${user}/${id}`);
      return Promise.resolve();
    },
    now: Date.now,
    newRevision: () => crypto.randomUUID(),
  });
  const answerSignIn = signInStandIn(base);
  const answerObject = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "PUT") objects.set(request.url!, await readBody(request));
    const stored = objects.get(request.url!);
    response.statusCode = request.method === "GET" && !stored ? 404 : 200;
    response.end(request.method === "GET" ? stored : undefined);
  };
  const answerApi = async (request: IncomingMessage, response: ServerResponse) => {
    const user = tokenSubject(request.headers.authorization);
    const body = String(await readBody(request));
    response.setHeader("content-type", "application/json");
    const result = user
      ? await api.handle(user, request.method!, request.url!, body)
      : { status: 401, body: {} };
    response.statusCode = result.status;
    response.end(JSON.stringify(result.body));
  };
  return {
    /** Answers this fixture's requests, and returns false for anyone else's. */
    handle(request: IncomingMessage, response: ServerResponse) {
      const url = request.url ?? "";
      if (url.startsWith("/oidc/")) answerSignIn(request, response);
      else if (url.startsWith("/objects/")) void answerObject(request, response);
      else if (url.startsWith("/api/")) void answerApi(request, response);
      else return false;
      return true;
    },
  };
}

const json = (response: ServerResponse, status: number, body: object) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
};
const redirect = (response: ServerResponse, to: string) => {
  response.statusCode = 302;
  response.setHeader("location", to);
  response.end();
};

/** The sign-in service: discovery, the sign-in page, codes checked against PKCE, and tokens. */
function signInStandIn(base: () => string) {
  const grants = new Map<string, Grant>();
  const issuer = () => `${base()}/oidc`;
  const tokens = (email: string) => {
    const sub = createHash("sha256").update(email).digest("hex").slice(0, 32);
    return {
      access_token: token({ sub, token_use: "access", client_id: FIXTURE_CLIENT_ID }),
      id_token: token({ sub, iss: issuer(), aud: FIXTURE_CLIENT_ID, email, token_use: "id" }),
      refresh_token: `refresh:${email}`,
      token_type: "Bearer",
      expires_in: 3600,
    };
  };
  const discovery = () => ({
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/authorize`,
    token_endpoint: `${issuer()}/token`,
    jwks_uri: `${issuer()}/jwks`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
  });
  const authorize = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url!, base());
    if (request.method === "GET") {
      response.setHeader("content-type", "text/html");
      response.end(signInPage(url.searchParams));
      return;
    }
    const form = new URLSearchParams(String(await readBody(request)));
    const back = new URL(form.get("redirect_uri")!);
    back.searchParams.set("state", form.get("state") ?? "");
    const email = form.get("email") ?? "";
    const code = randomBytes(16).toString("hex");
    grants.set(code, { email, challenge: form.get("code_challenge") ?? "" });
    back.searchParams.set("code", code);
    redirect(response, back.toString());
  };
  const exchange = async (request: IncomingMessage, response: ServerResponse) => {
    const form = new URLSearchParams(String(await readBody(request)));
    if (form.get("grant_type") === "refresh_token") {
      const email = form.get("refresh_token")?.replace(/^refresh:/, "") ?? "";
      return json(response, 200, tokens(email));
    }
    const grant = grants.get(form.get("code") ?? "");
    grants.delete(form.get("code") ?? "");
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (!grant || grant.challenge !== challenge)
      return json(response, 400, { error: "invalid_grant" });
    json(response, 200, tokens(grant.email));
  };
  return (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url!, base()).pathname;
    if (path === "/oidc/.well-known/openid-configuration") return json(response, 200, discovery());
    if (path === "/oidc/authorize") return void authorize(request, response);
    if (path === "/oidc/token") return void exchange(request, response);
    if (path === "/oidc/jwks") return json(response, 200, { keys: [] });
    // Signing out returns to the site, as Auth0 does.
    if (path === "/oidc/logout")
      return redirect(response, `${new URL(request.headers.referer ?? base()).origin}/`);
    json(response, 404, {});
  };
}
