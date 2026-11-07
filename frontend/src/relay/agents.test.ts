import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollaborationProvider } from "../collaboration/provider";
import type { ConnectionState, Transport } from "../collaboration/transport";
import { CanvasDocument } from "../document/canvasDocument";
import { attachRelay } from "./attach";
import { AgentGateway, type McpConfig } from "./mcpHttp";
import { Relay } from "./relay";

const ROOM = "a".repeat(48);
const config: McpConfig = {
  resource: "https://relay.example/mcp",
  issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test",
  clientId: "agents",
  authDomain: "https://arconis.auth.us-east-1.amazoncognito.com",
};
const TOKENS: Record<string, string> = { alice: "user-alice", bob: "user-bob" };
interface Reply {
  status: string;
  reason?: string;
  result?: Record<string, unknown>;
  changes: { items: unknown[] };
}

/** A person's browser in miniature: the real provider over a real socket to the relay. */
class SocketTransport implements Transport {
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
let base = "";
let relay: Relay;
let gateway: AgentGateway;
const cleanups: (() => unknown)[] = [];

beforeEach(async () => {
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
        TOKENS[token] ? { user: TOKENS[token], clientId: "agents", scopes: [] } : null
      )
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
});

async function person(name = "Alice") {
  const document = new CanvasDocument();
  const provider = new CollaborationProvider(
    document.doc,
    new SocketTransport(`${base.replace("http", "ws")}/rooms/${ROOM}`),
    () => {}
  );
  provider.awareness.setLocalStateField("user", { name, color: "#000" });
  provider.connect();
  await expect.poll(() => relay.peopleIn(ROOM)).toBeGreaterThan(0);
  cleanups.push(() => {
    provider.destroy();
    document.destroy();
  });
  return { document, provider };
}

async function agent(token = "alice") {
  const client = new Client({ name: "Test Agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  cleanups.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      content: { text: string }[];
    };
    return JSON.parse(result.content[0].text) as Reply;
  };
  return { client, call };
}

describe("signing in", () => {
  it("challenges an agent without a valid token and points it at the sign-in metadata", async () => {
    const response = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://relay.example/.well-known/oauth-protected-resource/mcp", scope="openid email"'
    );
    const resource = (await (
      await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({
      resource: config.resource,
      authorization_servers: ["https://relay.example"],
    });
    const server = (await (
      await fetch(`${base}/.well-known/oauth-authorization-server`)
    ).json()) as Record<string, unknown>;
    expect(server).toMatchObject({
      authorization_endpoint: `${config.authDomain}/oauth2/authorize`,
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("keeps one user's session from another", async () => {
    const { client } = await agent("alice");
    const sessionId = (client.transport as StreamableHTTPClientTransport).sessionId!;
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer bob",
        "mcp-session-id": sessionId,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("working in a room", () => {
  it("changes a room someone has open, and the person sees it merge", async () => {
    const alice = await person();
    const { call } = await agent();
    const opened = await call("open_room", { room: `https://arconis.ahara.io/#room=${ROOM}` });
    expect(opened).toMatchObject({ status: "done", result: { present: ["Alice"] } });
    const added = await call("apply", {
      operations: [
        {
          op: "add",
          type: "node",
          stencil: "service",
          name: "Auth",
          at: { x: 0, y: 0 },
          as: "auth",
        },
        {
          op: "add",
          type: "node",
          stencil: "database",
          name: "Users DB",
          at: { beside: "auth", side: "right" },
        },
        { op: "connect", from: "auth", to: "Users DB", name: "reads" },
      ],
    });
    expect(added.status).toBe("done");
    await expect
      .poll(() =>
        alice.document
          .list()
          .map((object) => object.label)
          .sort((a, b) => a.localeCompare(b))
      )
      .toEqual(["Auth", "reads", "Users DB"]);
    const awareness = [...alice.provider.awareness.getStates().values()] as {
      user?: { name: string };
    }[];
    expect(awareness.map((state) => state.user?.name)).toContain("Test Agent (agent)");
  });

  it("tells the agent what the person changed, and refuses to act on its stale picture", async () => {
    const alice = await person();
    const { call } = await agent();
    await call("open_room", { room: ROOM });
    await call("apply", {
      operations: [{ op: "add", type: "node", name: "Box", at: { x: 0, y: 0 } }],
    });
    await expect.poll(() => alice.document.list().length).toBe(1);
    alice.document.patch(alice.document.list()[0].id, { y: 500 });
    // Long enough for the person's edit to cross the relay, far shorter than any timeout.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const move = { operations: [{ op: "place", item: "Box", to: { by: { dx: 100, dy: 0 } } }] };
    const refused = await call("apply", move);
    expect(refused).toMatchObject({
      status: "refused",
      current: [expect.objectContaining({ name: "Box", y: 500 })],
      changes: { items: [expect.objectContaining({ name: "Box", what: ["moved"] })] },
    });
    expect(alice.document.list()[0].x).toBe(0);
    // Having been shown the change, the agent resends and the move composes with it.
    expect((await call("apply", move)).status).toBe("done");
    await expect.poll(() => alice.document.list()[0]).toMatchObject({ x: 100, y: 500 });
  });
});

describe("rooms an agent cannot use", () => {
  it("refuses rooms it cannot work in", async () => {
    const { call } = await agent();
    expect(await call("open_room", { room: ROOM })).toMatchObject({
      status: "failed",
      reason: expect.stringMatching(/Nobody has this room open/),
    });
    expect(
      await call("open_room", { room: `https://arconis.ahara.io/#locked=${ROOM}` })
    ).toMatchObject({ reason: expect.stringMatching(/password room/) });
    expect(
      await call("open_room", { room: `https://arconis.ahara.io/#local=${ROOM}` })
    ).toMatchObject({ reason: expect.stringMatching(/only in one browser/) });
    expect(await call("read")).toMatchObject({ reason: "Open a room first with open_room." });
  });

  it("stops editing once everyone has left, since nothing would be kept", async () => {
    const alice = await person();
    const { call } = await agent();
    await call("open_room", { room: ROOM });
    alice.provider.destroy();
    await expect.poll(() => relay.peopleIn(ROOM)).toBe(0);
    expect(
      await call("apply", { operations: [{ op: "add", type: "node", name: "Lost" }] })
    ).toMatchObject({
      status: "failed",
      reason: expect.stringMatching(/Everyone has left/),
    });
  });

  it("does not keep the relay running for agents alone", async () => {
    await person();
    const { call } = await agent();
    await call("open_room", { room: ROOM });
    expect(relay.connectionCount).toBe(1);
  });
});
