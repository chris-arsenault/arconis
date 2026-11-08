import { describe, expect, it, vi } from "vitest";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  AgentSessions,
  MAX_SESSIONS,
  MAX_SESSIONS_PER_USER,
  SESSION_IDLE_MS,
} from "./agentSessions";
import { agent, person, tool, rpc, gateway, relay, ROOM, advanceTime } from "./agentTestHarness";
import { ServerPeer, type PeerReadiness } from "./serverPeer";

function opened(result: Awaited<ReturnType<typeof tool>>) {
  expect(result.isError).toBe(false);
  return result.structuredContent as { session_id: string; canvas: string };
}

describe("explicit room sessions", () => {
  it("returns a handle and requires it on room tools without requiring initialization", async () => {
    const alice = await person();
    alice.document.create("node", 0, 0, { id: "box", name: "Browser content" });
    const { session_id, canvas } = opened(await tool("open_room", { room: ROOM }));
    expect(canvas).toContain("Browser content");
    expect(JSON.stringify(await tool("describe_canvas", { session_id }))).toContain(
      "Browser content"
    );
    expect(JSON.stringify(await tool("read", { session_id }))).toContain("Browser content");
    const response = await rpc("tools/list");
    expect(response.headers.has("mcp-session-id")).toBe(false);
    const { result } = (await response.json()) as {
      result: { tools: { name: string; inputSchema: { required: string[] } }[] };
    };
    for (const name of ["describe_canvas", "read", "write", "undo", "close_room"]) {
      expect(result.tools.find((entry) => entry.name === name)?.inputSchema.required).toContain(
        "session_id"
      );
      expect(await tool(name)).toMatchObject({ isError: true });
    }
    expect(await tool("canvas_help")).toMatchObject({ isError: false });
    expect(await tool("list_stencils")).toMatchObject({ isError: false });
  });

  it("retains a room across repeated initialization and independent client lifetimes", async () => {
    await person();
    const first = await agent();
    await first.call("open_room", { room: ROOM });
    await first.call("write", { statements: 'node box "Kept across reconnect" at 0,0' });
    expect((first.client.transport as StreamableHTTPClientTransport).sessionId).toBeUndefined();
    await first.client.close();
    for (let count = 0; count < 6; count++) {
      const next = await agent();
      expect(await next.call("read", { session_id: first.sessionId })).toContain(
        "Kept across reconnect"
      );
      await next.client.close();
    }
    expect(gateway.sessionCount).toBe(1);
    const response = await rpc(
      "tools/call",
      { name: "describe_canvas", arguments: { session_id: first.sessionId } },
      "alice",
      { "mcp-session-id": "obsolete-transport-id" }
    );
    expect(JSON.stringify(await response.json())).toContain("Kept across reconnect");
  });

  it("preserves stale-read protection and independent undo history across connections", async () => {
    const alice = await person();
    const first = await agent();
    await first.call("open_room", { room: ROOM });
    await first.call("write", { statements: 'node box "Box" at 0,0' });
    await expect.poll(() => alice.document.get("box")?.y).toBe(0);
    const second = await agent();
    await second.call("open_room", { room: ROOM });
    await second.call("write", { statements: 'node other "Other session" at 900,900' });
    alice.document.patch("box", { y: 500 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await first.client.close();
    const resumed = await agent();
    const move = { session_id: first.sessionId, statements: "edit box by 100,0" };
    expect(await resumed.call("write", move)).toContain("Since you last saw them");
    expect(await resumed.call("write", move)).toContain("Done");
    await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 100, y: 500 });
    await resumed.call("undo", { session_id: first.sessionId });
    await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 0, y: 500 });
    expect(alice.document.get("other")?.name).toBe("Other session");
    await resumed.call("close_room", { session_id: first.sessionId });
    expect(await second.call("read")).toContain("Other session");
  });
});

describe("room ownership and lifecycle", () => {
  it("refuses another user or OAuth client even when they supply the correct handle", async () => {
    const alice = await person();
    const { session_id } = opened(await tool("open_room", { room: ROOM }));
    for (const token of ["bob", "otherClient"]) {
      for (const name of ["describe_canvas", "read", "write", "undo", "close_room"]) {
        const result = await tool(name, { session_id, statements: 'node intruder "No"' }, token);
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).toContain("unknown or has ended");
      }
    }
    expect(alice.document.list()).toEqual([]);
    expect(await tool("read", { session_id })).toMatchObject({ isError: false });
    expect(gateway.sessionCount).toBe(1);
  });

  it("refreshes idle expiry on room calls, releases peers and preserves browser content", async () => {
    const alice = await person();
    const { session_id } = opened(await tool("open_room", { room: ROOM }));
    await tool("write", { session_id, statements: 'node box "Saved in browser" at 0,0' });
    await expect.poll(() => alice.document.get("box")?.name).toBe("Saved in browser");
    advanceTime(SESSION_IDLE_MS - 1);
    expect(await tool("read", { session_id })).toMatchObject({ isError: false });
    advanceTime(2);
    gateway.sweep();
    expect(gateway.sessionCount).toBe(1);
    advanceTime(SESSION_IDLE_MS);
    expect(await tool("read", { session_id })).toMatchObject({ isError: true });
    gateway.sweep();
    expect(gateway.sessionCount).toBe(0);
    expect(alice.document.get("box")?.name).toBe("Saved in browser");
    expect(relay.connectionCount).toBe(1);
    expect(opened(await tool("open_room", { room: ROOM })).session_id).not.toBe(session_id);
  });

  it("does not replace a working room when another open fails", async () => {
    await person();
    const { session_id } = opened(await tool("open_room", { room: ROOM }));
    for (let count = 0; count < 6; count++)
      expect(
        await tool("open_room", { room: `https://arconis.ahara.io/#locked=${ROOM}` })
      ).toMatchObject({ isError: true });
    expect(gateway.sessionCount).toBe(1);
    expect(await tool("read", { session_id })).toMatchObject({ isError: false });
  });

  it("limits room sessions, lets callers close one and rejects released handles", async () => {
    await person();
    const ids: string[] = [];
    for (let count = 0; count < MAX_SESSIONS_PER_USER; count++)
      ids.push(opened(await tool("open_room", { room: ROOM })).session_id);
    const refused = await tool("open_room", { room: ROOM });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toContain("close_room");
    expect(await tool("close_room", { session_id: ids[0] })).toMatchObject({ isError: false });
    expect(await tool("read", { session_id: ids[0] })).toMatchObject({ isError: true });
    opened(await tool("open_room", { room: ROOM }));
    expect(gateway.sessionCount).toBe(MAX_SESSIONS_PER_USER);
  });

  it("drops all room sessions on shutdown", async () => {
    await person();
    const { session_id } = opened(await tool("open_room", { room: ROOM }));
    gateway.close();
    expect(gateway.sessionCount).toBe(0);
    expect(await tool("read", { session_id })).toMatchObject({ isError: true });
  });
});

it("rejects missing or malformed room handles without damaging the room or subsequent calls", async () => {
  const alice = await person();
  const { session_id } = opened(await tool("open_room", { room: ROOM }));
  await tool("write", { session_id, statements: 'node box "Keep me" at 0,0' });
  for (const args of [
    {},
    { session_id: null },
    { session_id: "" },
    { session_id: 123 },
    { session_id: "invalid" },
  ]) {
    for (const name of ["describe_canvas", "read", "write", "undo", "close_room"]) {
      const result = await tool(name, {
        ...args,
        statements: 'node intruder "Should not be created" at 100,100',
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("session_id");
      expect(JSON.stringify(result)).not.toContain("Error reference");
    }
  }
  expect(gateway.sessionCount).toBe(1);
  expect(JSON.stringify(await tool("read", { session_id }))).toContain("Keep me");
  expect(await tool("write", { session_id, statements: "edit box at 100,100" })).toMatchObject({
    isError: false,
  });
  await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 100, y: 100 });
  expect(await tool("undo", { session_id })).toMatchObject({ isError: false });
  await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 0, y: 0 });
  expect(alice.document.list()).toHaveLength(1);
  expect(await tool("close_room", { session_id })).toMatchObject({ isError: false });
  expect((await rpc("tools/list")).status).toBe(200);
});

it("accepts duplicate initialize requests with and without a transport header without resetting rooms", async () => {
  const alice = await person();
  const { session_id } = opened(await tool("open_room", { room: ROOM }));
  await tool("write", { session_id, statements: 'node box "Survives initialize" at 0,0' });
  const initialize = {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "Repeated initialization", version: "1" },
  };
  const headerCases: Record<string, string>[] = [
    {},
    { "mcp-session-id": "old-transport-session" },
    { "mcp-session-id": session_id },
  ];
  for (const headers of headerCases) {
    for (let count = 0; count < 2; count++) {
      const response = await rpc("initialize", initialize, "alice", headers);
      expect(response.status).toBe(200);
      expect(response.headers.has("mcp-session-id")).toBe(false);
      expect(await response.json()).toMatchObject({ result: { serverInfo: { name: "arconis" } } });
    }
  }
  expect(gateway.sessionCount).toBe(1);
  expect(JSON.stringify(await tool("describe_canvas", { session_id }))).toContain(
    "Survives initialize"
  );
  expect(await tool("write", { session_id, statements: "edit box at 200,100" })).toMatchObject({
    isError: false,
  });
  await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 200, y: 100 });
  await tool("undo", { session_id });
  await expect.poll(() => alice.document.get("box")).toMatchObject({ x: 0, y: 0 });
  expect(alice.document.list()).toHaveLength(1);
});

it("releases the peer and registry slot if synchronization throws", async () => {
  await person();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const close = vi.spyOn(ServerPeer.prototype, "close");
  vi.spyOn(ServerPeer.prototype, "start").mockRejectedValueOnce(new Error("Sync failed"));
  expect(await tool("open_room", { room: ROOM })).toMatchObject({ isError: true });
  expect(close).toHaveBeenCalledOnce();
  expect(gateway.sessionCount).toBe(0);
});

it("does not resurrect a room session closed while synchronization is pending", async () => {
  await person();
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let finishSync: (value: PeerReadiness) => void = () => {};
  const synced = new Promise<PeerReadiness>((resolve) => {
    finishSync = resolve;
  });
  const close = vi.spyOn(ServerPeer.prototype, "close");
  vi.spyOn(ServerPeer.prototype, "start").mockImplementationOnce(function (this: ServerPeer) {
    this.provider.connect();
    markStarted();
    return synced;
  });
  const opening = tool("open_room", { room: ROOM });
  await started;
  gateway.close();
  finishSync("ready");
  const result = await opening;
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).toContain("ended while opening");
  expect(close).toHaveBeenCalledOnce();
  expect(gateway.sessionCount).toBe(0);
});

it("bounds the total room registry and reclaims idle slots", () => {
  let now = 0;
  const sessions = new AgentSessions(
    () => relay,
    () => now
  );
  try {
    for (let count = 0; count < MAX_SESSIONS; count++)
      sessions.create({ user: `user-${count}`, clientId: "test" }, "Agent");
    const owner = { user: "another", clientId: "test" };
    expect(() => sessions.create(owner, "Agent")).toThrow("Too many room sessions");
    now += SESSION_IDLE_MS;
    expect(sessions.create(owner, "Agent").id).toBeTruthy();
    expect(sessions.size).toBe(1);
  } finally {
    sessions.close();
  }
});

it("rates requests by authenticated user across disposable transports", async () => {
  for (let count = 0; count < 120; count++) expect((await rpc("tools/list")).status).toBe(200);
  expect((await rpc("tools/list")).status).toBe(429);
  expect((await rpc("tools/list", {}, "bob")).status).toBe(200);
  advanceTime(60_000);
  gateway.sweep();
  expect((await rpc("tools/list")).status).toBe(200);
});
