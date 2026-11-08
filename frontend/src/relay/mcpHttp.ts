import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AgentSessions } from "./agentSessions";
import { createMcpServer } from "./mcp";
import type { Relay } from "./relay";
import { reportEvent, reportFailure, requestLogContext } from "./errors";

/**
 * How the MCP endpoint finds its sign-in service: the Ahara Auth0 tenant, where connectors register
 * themselves and people sign in with their Arconis account.
 */
export interface McpConfig {
  /** The endpoint's canonical URL, which is the Auth0 API's identifier and tokens' audience. */
  resource: string;
  /** The tenant's issuer, `https://auth.ahara.io/`. */
  issuer: string;
}

export interface Caller {
  user: string;
  clientId: string;
  scopes: string[];
}
/** Returns the caller a bearer token proves, or null for any token that is not valid here. */
export type TokenVerifier = (token: string) => Promise<Caller | null>;

export const MCP_PATH = "/mcp";
/** The API's scope, and `offline_access` so connectors can refresh instead of signing in again. */
export const SCOPES = ["edit:rooms", "offline_access"];
const MAX_BODY_BYTES = 1024 * 1024;
const CALLS_PER_MINUTE = 120;

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : undefined;
}

/** Correlation without logging session credentials, account identities or client ids. */
function diagnosticTag(value: unknown) {
  return typeof value === "string"
    ? createHash("sha256").update(value).digest("hex").slice(0, 16)
    : "none";
}

function logHttp(request: IncomingMessage, response: ServerResponse, work: () => Promise<void>) {
  const requestId = randomUUID();
  const started = performance.now();
  const fields = () => ({
    requestId,
    method: request.method ?? "unknown",
    sessionTag: diagnosticTag(
      request.headers["mcp-session-id"] ?? response.getHeader("mcp-session-id")
    ),
  });
  return requestLogContext.run({ requestId, sessionTag: fields().sessionTag }, () => {
    reportEvent("mcp_http_started", fields());
    response.once("finish", () => {
      const status = response.statusCode;
      let level: "info" | "warn" | "error" = "info";
      if (status >= 400) level = "warn";
      if (status >= 500) level = "error";
      reportEvent(
        "mcp_http_finished",
        { ...fields(), status, durationMs: performance.now() - started },
        level
      );
    });
    response.once("close", () => {
      if (!response.writableFinished)
        reportEvent(
          "mcp_http_aborted",
          { ...fields(), durationMs: performance.now() - started },
          "warn"
        );
    });
    return work();
  });
}

/**
 * Authenticated MCP requests use disposable transports. Explicit room sessions live independently
 * in the registry, so initialize, HTTP disconnects and reconnects never select or clear a room.
 */
export class AgentGateway {
  private rooms: AgentSessions;
  private calls = new Map<string, number[]>();

  constructor(
    relay: () => Relay,
    private config: McpConfig,
    private verify: TokenVerifier,
    private now: () => number = Date.now
  ) {
    this.rooms = new AgentSessions(relay, now);
  }

  private get origin() {
    return new URL(this.config.resource).origin;
  }

  /** Answers MCP and its discovery document; returns false for anything else. */
  async handle(request: IncomingMessage, response: ServerResponse) {
    const path = (request.url ?? "/").split("?")[0];
    if (path.startsWith("/.well-known/oauth-protected-resource")) {
      json(response, 200, this.resourceMetadata());
      return true;
    }
    if (path !== MCP_PATH) return false;
    await logHttp(request, response, () => this.serve(request, response));
    return true;
  }

  /** RFC 9728: Auth0 is where agents register and sign in for this endpoint. */
  resourceMetadata() {
    return {
      resource: this.config.resource,
      authorization_servers: [this.config.issuer],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Arconis",
    };
  }

  private challenge(response: ServerResponse, description: string) {
    reportEvent("mcp_request_refused", { reason: "authentication_required" }, "warn");
    const metadata = `${this.origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
    json(
      response,
      401,
      { error: "invalid_token", error_description: description },
      {
        "www-authenticate": `Bearer resource_metadata="${metadata}", scope="${SCOPES.join(" ")}"`,
      }
    );
  }

  private async caller(request: IncomingMessage, response: ServerResponse) {
    const header = request.headers.authorization ?? "";
    const token = /^Bearer (.+)$/i.exec(header)?.[1];
    try {
      const caller = token ? await this.verify(token) : null;
      if (!caller) this.challenge(response, "Sign in to Arconis to use agents.");
      return caller;
    } catch (error) {
      const errorId = reportFailure("verify_token", error);
      json(response, 503, {
        error:
          "Arconis could not verify sign-in. Retry later; report the reference if it persists.",
        errorId,
      });
      return null;
    }
  }

  private async serve(request: IncomingMessage, response: ServerResponse) {
    const caller = await this.caller(request, response);
    if (!caller) return;
    reportEvent("mcp_request_authenticated", {
      actorTag: diagnosticTag(caller.user),
      clientTag: diagnosticTag(caller.clientId),
    });
    if (request.method !== "POST")
      return json(
        response,
        405,
        { error: "Use POST for MCP requests and close_room to leave a room." },
        { allow: "POST" }
      );
    let body: unknown;
    try {
      body = await readBody(request);
    } catch {
      reportEvent("mcp_request_refused", { reason: "invalid_request_body" }, "warn");
      return json(response, 400, { error: "The request body is not valid JSON or is too large." });
    }
    if (!this.withinRate(caller.user)) {
      reportEvent("mcp_request_refused", { reason: "rate_limited" }, "warn");
      return json(
        response,
        429,
        { error: "Too many requests; slow down." },
        { "retry-after": "10" }
      );
    }
    await this.dispatch(caller, request, response, body);
  }

  private withinRate(user: string) {
    const now = this.now();
    const calls = (this.calls.get(user) ?? []).filter((time) => now - time < 60_000);
    this.calls.set(user, calls);
    if (calls.length >= CALLS_PER_MINUTE) return false;
    calls.push(now);
    return true;
  }

  private async dispatch(
    caller: Caller,
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown
  ) {
    const server = createMcpServer(this.rooms, caller);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } finally {
      await server.close().catch((error: unknown) => reportFailure("mcp_close", error));
    }
  }

  /** Releases idle room peers and expired rate windows. */
  sweep() {
    const now = this.now();
    this.rooms.sweep();
    this.calls.forEach((calls, user) => {
      if (calls.every((time) => now - time >= 60_000)) this.calls.delete(user);
    });
  }

  close() {
    this.rooms.close();
    this.calls.clear();
  }

  get sessionCount() {
    return this.rooms.size;
  }
}
