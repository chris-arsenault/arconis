import type { RelayStatus } from "../collaboration/serviceProtocol";
import {
  MCP_PATH,
  MCP_RELAY_PATH,
  SCOPES,
  resourceMetadata,
  type McpConfig,
  type TokenVerifier,
} from "../protocol/mcp";
import { reportFailure } from "./errors";

export interface AlbRequest {
  path: string;
  httpMethod: string;
  headers?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
}

interface AlbResponse {
  statusCode: number;
  isBase64Encoded: boolean;
  headers: Record<string, string>;
  body: string;
}

const AVAILABILITY: Record<RelayStatus, string> = {
  stopped:
    "The Arconis relay is stopped. Open the room in Arconis and start the relay, then reconnect the assistant.",
  starting: "The Arconis relay is starting. Keep the room open and retry shortly.",
  stopping:
    "The Arconis relay is stopping. Wait for it to stop, then start it from the room and reconnect.",
  running: "The Arconis relay is not accepting requests yet. Keep the room open and retry shortly.",
  limit:
    "The Arconis relay has reached its monthly spending limit. It cannot accept agent requests until the limit resets or the owner raises it.",
};

function reply(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): AlbResponse {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

function parseRequest(raw: string): RpcRequest | null {
  try {
    const request = JSON.parse(raw) as RpcRequest;
    return request?.jsonrpc === "2.0" && typeof request.method === "string" ? request : null;
  } catch {
    return null;
  }
}

function copyHeaders(headers: Headers, names: string[]) {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) result[name] = value;
  }
  return result;
}

function requestBody(event: AlbRequest) {
  const raw = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
}

/** MCP stays on the relay; this stateless entry point translates availability failures only. */
export class McpProxy {
  constructor(
    private config: McpConfig,
    private verify: TokenVerifier,
    private status: () => Promise<RelayStatus>,
    private upstream: typeof fetch = fetch
  ) {}

  async handle(event: AlbRequest) {
    if (event.path.startsWith("/.well-known/oauth-protected-resource"))
      return reply(200, resourceMetadata(this.config));
    if (event.path !== MCP_PATH) return null;
    const headers = new Headers(event.headers);
    const refused = await this.authenticate(headers.get("authorization") ?? "");
    if (refused) return refused;
    if (event.httpMethod !== "POST")
      return reply(
        405,
        { error: "Use POST for MCP requests and close_room to leave a room." },
        { allow: "POST" }
      );
    const raw = requestBody(event);
    const request = parseRequest(raw);
    if (!request) return reply(400, { error: "Expected an MCP JSON-RPC request." });
    const response = await this.forward(request, raw, headers);
    if (response) return response;
    try {
      return this.unavailable(request, AVAILABILITY[await this.status()]);
    } catch (error) {
      const errorId = reportFailure("mcp_availability", error);
      return this.unavailable(
        request,
        `The Arconis relay is unavailable and its status could not be checked. Retry later. Error reference: ${errorId}.`
      );
    }
  }

  private async authenticate(authorization: string) {
    const token = /^Bearer (.+)$/i.exec(authorization)?.[1];
    try {
      const caller = token ? await this.verify(token) : null;
      if (!caller) {
        const metadata = `${new URL(this.config.resource).origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
        return reply(
          401,
          { error: "invalid_token", error_description: "Sign in to Arconis to use agents." },
          {
            "www-authenticate": `Bearer resource_metadata="${metadata}", scope="${SCOPES.join(" ")}"`,
          }
        );
      }
    } catch (error) {
      const errorId = reportFailure("proxy_verify_token", error);
      return reply(503, { error: "Arconis could not verify sign-in. Retry later.", errorId });
    }
    return null;
  }

  private async forward(
    request: RpcRequest,
    raw: string,
    headers: Headers
  ): Promise<AlbResponse | null> {
    const forwarded = new Headers({
      ...copyHeaders(headers, ["authorization", "mcp-protocol-version", "mcp-session-id"]),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    });
    try {
      const response = await this.upstream(new URL(MCP_RELAY_PATH, this.config.resource), {
        method: "POST",
        headers: forwarded,
        body: raw,
        signal: AbortSignal.timeout(25_000),
        redirect: "error",
      });
      // Relay-authored errors already carry their own explanation. ALB failures are bare HTML.
      const contentType = response.headers.get("content-type") ?? "";
      if (response.status < 500 || contentType.includes("application/json")) {
        return {
          statusCode: response.status,
          headers: {
            "cache-control": "no-store",
            ...copyHeaders(response.headers, [
              "content-type",
              "www-authenticate",
              "retry-after",
              "allow",
              "mcp-session-id",
            ]),
          },
          isBase64Encoded: false,
          body: await response.text(),
        };
      }
      await response.body?.cancel();
      if (response.status !== 503)
        return this.unavailable(
          request,
          "The load balancer could not receive the Arconis relay's response. The outcome of any edit is unverified. Read the canvas before retrying an edit."
        );
      return null;
    } catch (error) {
      // Do not retry a forwarded write: it may have committed before its response was lost.
      const errorId = reportFailure("mcp_forward", error);
      return this.unavailable(
        request,
        `Arconis could not receive the relay's response. Error reference: ${errorId}. The outcome of any edit is unverified. Read the canvas before retrying an edit.`
      );
    }
  }

  private unavailable(request: RpcRequest, message: string) {
    if (request.id === undefined) return reply(202, undefined);
    const envelope = { jsonrpc: "2.0", id: request.id };
    if (request.method === "tools/call")
      return reply(
        200,
        { ...envelope, result: { isError: true, content: [{ type: "text", text: message }] } },
        { "retry-after": "10" }
      );
    return reply(503, { ...envelope, error: { code: -32000, message } }, { "retry-after": "10" });
  }
}
