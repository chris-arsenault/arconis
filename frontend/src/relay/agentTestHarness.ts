import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { CollaborationProvider } from "../collaboration/provider";
import type { ConnectionState, FrameChannel } from "../collaboration/channel";
import { CanvasDocument } from "../document/canvasDocument";
import { attachRelay } from "./attach";
import { AgentGateway } from "./mcpHttp";
import type { McpConfig } from "../protocol/mcp";
import { Relay } from "./relay";
import { LockedTransport } from "../collaboration/lockedTransport";
import { createEnvelope, defaultRoomKey, DEFAULT_PASSWORD } from "../collaboration/roomKey";

export const ROOM = "a".repeat(48);
export const config: McpConfig = {
  resource: "https://relay.example/mcp",
  issuer: "https://auth.example/",
};
const TOKENS: Record<string, string> = {
  alice: "user-alice",
  bob: "user-bob",
  otherClient: "user-alice",
};
const UNKNOWN_SESSION = "00000000-0000-4000-8000-000000000000";

/** A person's browser in miniature: the real provider over a real socket to the relay. */
class SocketTransport implements FrameChannel {
  onMessage: (message: string) => void = () => {};
  onReady = () => {};
  onStatus: (state: ConnectionState, detail?: string) => void = () => {};
  private socket: WebSocket | null = null;
  constructor(private url: string) {}
  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onopen = () => this.onReady();
    this.socket.onmessage = (event: MessageEvent<string>) => {
      if (!event.data.startsWith('{"relay"')) this.onMessage(event.data);
    };
  }
  send(message: string) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
  }
  close() {
    this.socket?.close();
  }
}

let server: Server;
let now = 0;
export let base = "";
export let relay: Relay;
export let gateway: AgentGateway;
const cleanups: (() => unknown)[] = [];

export function replaceGateway(next: AgentGateway) {
  gateway.close();
  gateway = next;
}

export function advanceTime(ms: number) {
  now += ms;
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  now = Date.now();
  relay = new Relay({
    now: Date.now,
    stop: () => {},
    withinBudget: () => Promise.resolve(true),
    uploads: null,
  });
  gateway = new AgentGateway(
    () => relay,
    config,
    (token) =>
      Promise.resolve(
        TOKENS[token]
          ? {
              user: TOKENS[token],
              clientId: token === "otherClient" ? "other" : "agents",
              scopes: [],
            }
          : null
      ),
    () => now
  );
  server = createServer((request, response) => {
    void gateway.handle(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  const sockets = attachRelay(server, () => relay, { allowedOrigin: null, accepting: () => true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(() => {
    gateway.close();
    sockets.clients.forEach((socket) => socket.terminate());
    return new Promise((resolve) => server.close(resolve));
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

export async function person(name = "Alice") {
  const document = new CanvasDocument();
  const id = crypto.randomUUID();
  const transport = new LockedTransport(
    new SocketTransport(`${base.replace("http", "ws")}/rooms/${ROOM}`),
    id
  );
  const key = await defaultRoomKey(ROOM);
  const envelope = await createEnvelope(DEFAULT_PASSWORD, key, 1);
  transport.shareEnvelope = () => envelope;
  transport.envelopeKnown();
  transport.unlock(key);
  const provider = new CollaborationProvider(document.doc, transport, () => {}, id);
  provider.awareness.setLocalStateField("user", { name, color: "#000" });
  provider.connect();
  await expect.poll(() => relay.peopleIn(ROOM)).toBeGreaterThan(0);
  cleanups.push(() => {
    provider.destroy();
    document.destroy();
  });
  return { document, provider };
}

export async function agent(token = "alice") {
  const client = new Client({ name: "Test Agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  cleanups.push(() => client.close());
  let sessionId = UNKNOWN_SESSION;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const roomTool = [
      "describe_canvas",
      "read",
      "write",
      "undo",
      "close_room",
      "check_layout",
    ].includes(name);
    const result = (await client.callTool({
      name,
      arguments: roomTool
        ? { session_id: sessionId, ...args }
        : { ...(name === "open_room" ? { name: "Test Agent" } : {}), ...args },
    })) as CallToolResult;
    if (name === "open_room" && !result.isError) {
      const opened = result.structuredContent as { session_id: string; canvas: string };
      sessionId = opened.session_id;
      return opened.canvas;
    }
    return (result.content[0] as { text: string }).text;
  };
  return {
    client,
    call,
    get sessionId() {
      return sessionId;
    },
  };
}

export function rpc(
  method: string,
  params: Record<string, unknown> = {},
  token = "alice",
  headers: Record<string, string> = {}
) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

export async function tool(name: string, args: Record<string, unknown> = {}, token = "alice") {
  const response = await rpc("tools/call", { name, arguments: args }, token);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: CallToolResult };
  return body.result;
}
