import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentSession } from "./agentSession";
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
/** A connection unused this long is closed, with the agent's room peer. */
export const SESSION_IDLE_MS = 30 * 60_000;
export const MAX_SESSIONS = 50;
export const MAX_SESSIONS_PER_USER = 5;
const MAX_BODY_BYTES = 1024 * 1024;
const CALLS_PER_MINUTE = 120;

interface Connection {
  user: string;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  agent: AgentSession;
  lastUsed: number;
  calls: number[];
}

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
 * The MCP endpoint on the relay host. Signed-in agents connect here, and each connection holds an
 * agent session in memory; replacing the instance ends them, and agents reconnect.
 */
export class AgentGateway {
  private connections = new Map<string, Connection>();

  constructor(
    private relay: () => Relay,
    private config: McpConfig,
    private verify: TokenVerifier,
    private now: () => number = Date.now
  ) {}

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
    const sessionId = request.headers["mcp-session-id"];
    let body: unknown;
    try {
      body = request.method === "POST" ? await readBody(request) : undefined;
    } catch {
      reportEvent("mcp_request_refused", { reason: "invalid_request_body" }, "warn");
      return json(response, 400, { error: "The request body is not valid JSON or is too large." });
    }
    if (typeof sessionId !== "string") {
      if (request.method !== "POST" || !isInitializeRequest(body)) {
        reportEvent("mcp_request_refused", { reason: "initialize_required" }, "warn");
        return json(response, 400, { error: "Start a session with an initialize request." });
      }
      return this.start(caller, request, response, body);
    }
    const connection = this.connections.get(sessionId);
    if (!connection || connection.user !== caller.user) {
      reportEvent("mcp_request_refused", { reason: "unknown_or_foreign_session" }, "warn");
      return json(response, 404, { error: "This session has ended; reconnect." });
    }
    if (!this.withinRate(connection)) {
      reportEvent(
        "mcp_request_refused",
        { reason: "rate_limited", session: connection.agent.logId },
        "warn"
      );
      return json(
        response,
        429,
        { error: "Too many requests; slow down." },
        { "retry-after": "10" }
      );
    }
    connection.lastUsed = this.now();
    await connection.transport.handleRequest(request, response, body);
  }

  private withinRate(connection: Connection) {
    const now = this.now();
    connection.calls = connection.calls.filter((time) => now - time < 60_000);
    if (connection.calls.length >= CALLS_PER_MINUTE) return false;
    connection.calls.push(now);
    return true;
  }

  private async start(
    caller: Caller,
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown
  ) {
    const own = [...this.connections.values()].filter((c) => c.user === caller.user).length;
    if (this.connections.size >= MAX_SESSIONS || own >= MAX_SESSIONS_PER_USER) {
      reportEvent("mcp_request_refused", { reason: "session_capacity" }, "warn");
      return json(response, 503, {
        error: "Too many agent sessions are open; close one and retry.",
      });
    }
    const clientName = (body as { params?: { clientInfo?: { name?: unknown } } }).params?.clientInfo
      ?.name;
    const agent = new AgentSession(this.relay, agentName(clientName));
    const server = createMcpServer(agent);
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        this.connections.set(id, {
          user: caller.user,
          transport,
          server,
          agent,
          lastUsed: this.now(),
          calls: [],
        });
        reportEvent("mcp_session_created", {
          session: agent.logId,
          sessionTag: diagnosticTag(id),
          actorTag: diagnosticTag(caller.user),
          clientTag: diagnosticTag(caller.clientId),
          activeSessions: this.connections.size,
        });
      },
      onsessionclosed: (id) => this.end(id, "client_delete"),
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  private end(id: string, reason: "client_delete" | "idle" | "shutdown") {
    const connection = this.connections.get(id);
    if (!connection) return;
    reportEvent("mcp_session_ended", {
      session: connection.agent.logId,
      reason,
      roomOpen: connection.agent.hasRoom,
    });
    this.connections.delete(id);
    connection.agent.leave();
    void connection.server.close().catch((error: unknown) => reportFailure("mcp_close", error));
  }

  /** Closes connections left unused, releasing their room peers. */
  sweep() {
    const now = this.now();
    this.connections.forEach((connection, id) => {
      if (now - connection.lastUsed >= SESSION_IDLE_MS) this.end(id, "idle");
    });
  }

  close() {
    [...this.connections.keys()].forEach((id) => this.end(id, "shutdown"));
  }

  get sessionCount() {
    return this.connections.size;
  }
}

/** The name people see for an agent, from what its client calls itself. */
export function agentName(clientName: unknown) {
  const name =
    typeof clientName === "string"
      ? clientName
          .replace(/[^\w .()-]/g, "")
          .trim()
          .slice(0, 40)
      : "";
  return `${name || "Agent"} (agent)`;
}
