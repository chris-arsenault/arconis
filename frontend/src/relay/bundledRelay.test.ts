import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, expect, it } from "vitest";
import WebSocket from "ws";
import { CollaborationProvider } from "../collaboration/provider";
import type { FrameChannel } from "../collaboration/channel";
import { CanvasDocument } from "../document/canvasDocument";
import { LockedTransport } from "../collaboration/lockedTransport";
import { createEnvelope, defaultRoomKey, DEFAULT_PASSWORD } from "../collaboration/roomKey";

let identity: Server;
let relay: ChildProcess;
let base = "";
let token = "";
let output = "";

beforeAll(async () => {
  const bundle = process.env.RELAY_TEST_BUNDLE;
  if (!bundle) await promisify(execFile)("pnpm", ["build:relay"]);
  const pair = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "local", alg: "RS256", use: "sig" };
  identity = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [jwk], status: "running" }));
  });
  await new Promise<void>((resolve) => identity.listen(0, "127.0.0.1", resolve));
  const issuer = `http://127.0.0.1:${(identity.address() as AddressInfo).port}/`;
  const resource = "https://relay.example/mcp";
  token = await new SignJWT({ scope: "edit:rooms" })
    .setProtectedHeader({ alg: "RS256", kid: "local" })
    .setIssuer(issuer)
    .setAudience(resource)
    .setSubject("local-person")
    .setExpirationTime("1h")
    .sign(pair.privateKey);
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise((resolve) => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  relay = spawn(process.execPath, [bundle ?? "dist-relay/server.cjs"], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      CONTROL_URL: issuer.slice(0, -1),
      ALLOWED_ORIGIN: "http://localhost",
      MCP_RESOURCE: resource,
      AUTH_ISSUER: issuer,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    relay.once("error", reject);
    relay.once("exit", () => reject(new Error(output)));
    relay.stderr!.on("data", (data: Buffer) => (output += data.toString()));
    relay.stdout!.on("data", (data: Buffer) => {
      output += data.toString();
      if (/Relay listening on \d+/.test(output)) resolve();
    });
  });
}, 20_000);

afterAll(async () => {
  if (relay && relay.exitCode === null) {
    const stopped = new Promise((resolve) => relay.once("exit", resolve));
    relay.kill();
    await stopped;
  }
  if (identity) await new Promise((resolve) => identity.close(resolve));
});

/** A real socket with the same framing as a browser, without a DOM or hosted services. */
function personChannel(room: string): FrameChannel {
  let socket: WebSocket;
  const channel: FrameChannel = {
    onMessage: () => {},
    onReady: () => {},
    onStatus: () => {},
    connect: () => {
      socket = new WebSocket(`${base.replace("http", "ws")}/rooms/${room}`, {
        origin: "http://localhost",
      });
      socket.onopen = () => channel.onReady();
      socket.on("message", (data) => {
        const message = data.toString();
        if (!message.startsWith('{"relay"')) channel.onMessage(message);
      });
    },
    send: (message) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    },
    close: () => socket.close(),
  };
  return channel;
}

it("opens and edits a person's room through the production bundle and HTTP MCP transport", async () => {
  const room = "b".repeat(48);
  const document = new CanvasDocument();
  document.create("node", 0, 0, { id: "box", name: "Browser content" });
  const id = crypto.randomUUID();
  const channel = new LockedTransport(personChannel(room), id);
  const key = await defaultRoomKey(room);
  const envelope = await createEnvelope(DEFAULT_PASSWORD, key, 1);
  channel.shareEnvelope = () => envelope;
  channel.envelopeKnown();
  channel.unlock(key);
  const provider = new CollaborationProvider(document.doc, channel, () => {}, id);
  provider.awareness.setLocalStateField("user", { name: "Alice", color: "#000" });
  const client = new Client({ name: "ChatGPT", version: "1" });
  const resumed = new Client({ name: "ChatGPT reconnected", version: "1" });
  try {
    provider.connect();
    await expect.poll(() => provider.sync).not.toBe("idle");
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      })
    );
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("open_room");
    const opened = await client.callTool({ name: "open_room", arguments: { room } });
    expect(opened).not.toHaveProperty("isError", true);
    expect(JSON.stringify(opened)).toContain("Browser content");
    const { session_id } = opened.structuredContent as { session_id: string };
    await client.close();
    await resumed.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      })
    );
    const described = await resumed.callTool({
      name: "describe_canvas",
      arguments: { session_id },
    });
    expect(JSON.stringify(described)).toContain("Browser content");
    const written = await resumed.callTool({
      name: "write",
      arguments: { session_id, statements: 'node api "API" right of box' },
    });
    expect(JSON.stringify(written)).toContain("Done");
    await expect.poll(() => document.get("api")?.name).toBe("API");
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read", arguments: { session_id } },
      }),
    });
    expect(JSON.stringify(await response.json())).toContain("API");
    await resumed.callTool({ name: "undo", arguments: { session_id } });
    await expect.poll(() => document.get("api")).toBeNull();
    await resumed.callTool({ name: "close_room", arguments: { session_id } });
  } finally {
    await resumed.close();
    await client.close();
    provider.destroy();
    document.destroy();
  }
});
