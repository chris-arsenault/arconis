import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentSession } from "./agentSession";
import { createMcpServer } from "./mcp";
import type { Relay } from "./relay";

/** How the MCP endpoint finds its sign-in service. Cognito is the authorization server. */
export interface McpConfig {
  /** The endpoint's canonical URL, which tokens must be bound to. */
  resource: string;
  /** The user pool's issuer, `https://cognito-idp.<region>.amazonaws.com/<pool>`. */
  issuer: string;
  /** The app client agents sign in through. */
  clientId: string;
  /** The user pool's sign-in domain, `https://<prefix>.auth.<region>.amazoncognito.com`. */
  authDomain: string;
}

export interface Caller {
  user: string;
  clientId: string;
  scopes: string[];
}
/** Returns the caller a bearer token proves, or null for any token that is not valid here. */
export type TokenVerifier = (token: string) => Promise<Caller | null>;

export const MCP_PATH = "/mcp";
export const SCOPES = ["openid", "email"];
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

  /** Answers MCP and its discovery documents; returns false for anything else. */
  async handle(request: IncomingMessage, response: ServerResponse) {
    const path = (request.url ?? "/").split("?")[0];
    if (path.startsWith("/.well-known/oauth-protected-resource")) {
      json(response, 200, this.resourceMetadata());
      return true;
    }
    if (
      path === "/.well-known/oauth-authorization-server" ||
      path === "/.well-known/openid-configuration"
    ) {
      json(response, 200, this.authorizationMetadata());
      return true;
    }
    if (path !== MCP_PATH) return false;
    await this.serve(request, response);
    return true;
  }

  /** RFC 9728: where agents sign in for this endpoint. */
  resourceMetadata() {
    return {
      resource: this.config.resource,
      authorization_servers: [this.origin],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Arconis",
    };
  }

  /**
   * RFC 8414 metadata describing the user pool's own endpoints. Cognito publishes no such document,
   * and MCP clients need one that declares PKCE support.
   */
  authorizationMetadata() {
    const domain = this.config.authDomain;
    return {
      issuer: this.origin,
      authorization_endpoint: `${domain}/oauth2/authorize`,
      token_endpoint: `${domain}/oauth2/token`,
      revocation_endpoint: `${domain}/oauth2/revoke`,
      jwks_uri: `${this.config.issuer}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: SCOPES,
    };
  }

  private challenge(response: ServerResponse, description: string) {
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

  private async caller(request: IncomingMessage) {
    const header = request.headers.authorization ?? "";
    const token = /^Bearer (.+)$/i.exec(header)?.[1];
    if (!token) return null;
    try {
      return await this.verify(token);
    } catch {
      return null;
    }
  }

  private async serve(request: IncomingMessage, response: ServerResponse) {
    const caller = await this.caller(request);
    if (!caller) return this.challenge(response, "Sign in to Arconis to use agents.");
    const sessionId = request.headers["mcp-session-id"];
    let body: unknown;
    try {
      body = request.method === "POST" ? await readBody(request) : undefined;
    } catch {
      return json(response, 400, { error: "The request body is not valid JSON or is too large." });
    }
    if (typeof sessionId !== "string") {
      if (request.method !== "POST" || !isInitializeRequest(body))
        return json(response, 400, { error: "Start a session with an initialize request." });
      return this.start(caller, request, response, body);
    }
    const connection = this.connections.get(sessionId);
    if (!connection || connection.user !== caller.user)
      return json(response, 404, { error: "This session has ended; reconnect." });
    if (!this.withinRate(connection))
      return json(
        response,
        429,
        { error: "Too many requests; slow down." },
        { "retry-after": "10" }
      );
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
    if (this.connections.size >= MAX_SESSIONS || own >= MAX_SESSIONS_PER_USER)
      return json(response, 503, {
        error: "Too many agent sessions are open; close one and retry.",
      });
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
      },
      onsessionclosed: (id) => this.end(id),
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  private end(id: string) {
    const connection = this.connections.get(id);
    if (!connection) return;
    this.connections.delete(id);
    connection.agent.leave();
    void connection.server.close().catch(() => {});
  }

  /** Closes connections left unused, releasing their room peers. */
  sweep() {
    const now = this.now();
    this.connections.forEach((connection, id) => {
      if (now - connection.lastUsed >= SESSION_IDLE_MS) this.end(id);
    });
  }

  close() {
    [...this.connections.keys()].forEach((id) => this.end(id));
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
