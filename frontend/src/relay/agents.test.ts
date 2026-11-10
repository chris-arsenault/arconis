import { describe, expect, it, vi } from "vitest";
import { AgentGateway } from "./mcpHttp";
import { AgentSession } from "./agentSession";
import { LANGUAGE_REFERENCE } from "../language/reference";
import { ROOM, config, base, relay, agent, person, replaceGateway } from "./agentTestHarness";

function loggedEvents() {
  return [...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls].map(
    ([line]) => JSON.parse(String(line)) as Record<string, string | number | boolean>
  );
}

describe("signing in", () => {
  it("challenges an agent without a valid token and points it at Auth0 to sign in", async () => {
    const response = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://relay.example/.well-known/oauth-protected-resource/mcp", scope="edit:rooms offline_access"'
    );
    const resource = (await (
      await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
    ).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({
      resource: config.resource,
      authorization_servers: [config.issuer],
    });
    // The relay serves no authorization server of its own.
    expect((await fetch(`${base}/.well-known/oauth-authorization-server`)).status).toBe(404);
  });

  it("keeps one user's session from another", async () => {
    await person();
    const alice = await agent("alice");
    await alice.call("open_room", { room: ROOM });
    const bob = await agent("bob");
    expect(await bob.call("read", { session_id: alice.sessionId })).toContain(
      "unknown or has ended"
    );
  });

  it("reports a verifier outage as a logged service failure, without challenging the bearer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    replaceGateway(
      new AgentGateway(
        () => relay,
        config,
        () => {
          throw new Error("Key service is unavailable");
        }
      )
    );
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer private-token" },
      body: "{}",
    });
    expect(response.status).toBe(503);
    expect(response.headers.has("www-authenticate")).toBe(false);
    const body = (await response.json()) as { errorId: string };
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      operation: "verify_token",
      errorId: body.errorId,
      message: "Key service is unavailable",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-token");
  });
});

it("correlates room state, refusals and closure without logging content or session credentials", async () => {
  const alice = await person();
  alice.document.create("node", 0, 0, { name: "PRIVATE CANVAS CONTENT" });
  const first = await agent();
  const second = await agent();
  expect(await first.call("open_room", { room: ROOM })).toContain("PRIVATE CANVAS CONTENT");
  expect(await first.call("describe_canvas")).toContain("PRIVATE CANVAS CONTENT");
  expect(await second.call("describe_canvas")).toContain("Call open_room");
  const sessionId = first.sessionId;
  await first.call("close_room");
  const events = loggedEvents();
  const created = events.filter((event) => event.event === "room_session_created");
  expect(created).toHaveLength(1);
  const finished = events.filter(
    (event) => event.event === "tool_finished" && event.operation !== "close_room"
  );
  expect(finished).toMatchObject([
    { session: created[0].session, operation: "open_room", outcome: "succeeded", roomOpen: true },
    {
      session: created[0].session,
      operation: "describe_canvas",
      outcome: "succeeded",
      roomOpen: true,
    },
    {
      session: "none",
      operation: "describe_canvas",
      outcome: "refused",
      roomOpen: false,
      level: "warn",
    },
  ]);
  for (const event of finished) {
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "mcp_http_finished",
        requestId: event.requestId,
        status: 200,
      })
    );
  }
  expect(events).toContainEqual(
    expect.objectContaining({
      event: "room_session_ended",
      session: created[0].session,
      reason: "client_close",
      roomOpen: true,
    })
  );
  const recorded = JSON.stringify(events);
  for (const secret of [ROOM, sessionId, "PRIVATE CANVAS CONTENT", "user-alice", "Bearer alice"])
    expect(recorded).not.toContain(secret);
});

it("logs malformed requests and accepts transport headers without using them as room handles", async () => {
  const headers = {
    authorization: "Bearer alice",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  expect((await fetch(`${base}/mcp`, { method: "POST", headers, body: "not-json" })).status).toBe(
    400
  );
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...headers, "mcp-session-id": "private-session-value" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(response.status).toBe(200);
  const events = loggedEvents();
  expect(events).toContainEqual(
    expect.objectContaining({
      event: "mcp_request_refused",
      reason: "invalid_request_body",
      level: "warn",
    })
  );
  expect(events).toContainEqual(
    expect.objectContaining({ event: "mcp_http_finished", status: 200 })
  );
  expect(JSON.stringify(events)).not.toContain("private-session-value");
});

describe("agent guidance and failures", () => {
  it("discovers and retrieves complete language topics before opening a room", async () => {
    const { client, call } = await agent();
    expect(client.getInstructions()).toContain("canvas_help");
    expect(client.getInstructions()).not.toContain(LANGUAGE_REFERENCE);
    const index = await call("canvas_help");
    expect(index).toContain("placement: Placement");
    const guide = await call("canvas_help", { topic: "placement" });
    expect(guide).toContain("## Placement");
    expect(guide).toContain("Give a frame both axes");
    expect(guide).not.toContain("## Arrangements");
    expect(await call("canvas_help", { topic: "all" })).toBe(LANGUAGE_REFERENCE);
    const missing = await client.callTool({ name: "canvas_help", arguments: { topic: "missing" } });
    expect(missing).toMatchObject({ isError: true });
    expect(JSON.stringify(missing)).toContain("Call canvas_help without a topic");
  });

  it("logs an unexpected tool failure and returns its reference without exposing internals", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(AgentSession.prototype, "openRoom").mockRejectedValueOnce(
      new Error("Simulated internal failure")
    );
    const { client, call } = await agent();
    const result = await client.callTool({ name: "open_room", arguments: { room: ROOM } });
    expect(result).toMatchObject({ isError: true });
    expect(log).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(log.mock.calls[0][0])) as { errorId: string };
    expect(record).toMatchObject({ operation: "open_room", message: "Simulated internal failure" });
    expect(JSON.stringify(result)).toContain(record.errorId);
    expect(JSON.stringify(result)).not.toContain("Simulated internal failure");
    expect(JSON.stringify(log.mock.calls)).not.toContain(ROOM);
    expect(await call("canvas_help")).toContain("placement");
  });

  it("marks expected refusals as tool errors and teaches discovery without logging a server fault", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await person();
    const { client, call } = await agent();
    const unopened = await client.callTool({ name: "read", arguments: {} });
    expect(unopened).toMatchObject({ isError: true });
    expect(JSON.stringify(unopened)).toContain("session_id");
    await call("open_room", { room: ROOM });
    expect(await call("read", { items: ["missing"] })).toContain("Use describe_canvas");
    expect(await call("write", { statements: "oops" })).toContain("Nothing was changed");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("working in a room", () => {
  it("changes a room someone has open, and the person sees it merge", async () => {
    const alice = await person();
    const { call } = await agent();
    const opened = await call("open_room", {
      room: `https://arconis.ahara.io/#room=${ROOM}&item=selected`,
    });
    expect(opened).toMatch(/People here: Alice/);
    const added = await call("write", {
      statements: 'node auth "Auth" service at 0,0\nauth -> node db "Users DB" database "reads"',
    });
    expect(added).toMatch(/Done: 3 created/);
    await expect
      .poll(() =>
        alice.document
          .list()
          .map((item) => item.name)
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
    await call("write", { statements: 'node box "Box" at 0,0' });
    await expect.poll(() => alice.document.list().length).toBe(1);
    alice.document.patch("box", { y: 500 });
    // Long enough for the person's edit to cross the relay, far shorter than any timeout.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const move = { statements: "edit box by 100,0" };
    const refused = await call("write", move);
    expect(refused).toMatch(/^\/\/ Nothing was changed\. Since you last saw them/);
    expect(refused).toMatch(/node box "Box" at 0,500/);
    expect(refused).toMatch(/Others changed since your last call:\nnode box "Box" at 0,500/);
    expect(alice.document.list()[0].x).toBe(0);
    // Having been shown the change, the agent resends and the move composes with it.
    expect(await call("write", move)).toMatch(/Done/);
    await expect.poll(() => alice.document.list()[0]).toMatchObject({ x: 100, y: 500 });
  });
});

describe("rooms an agent cannot use", () => {
  it("refuses rooms it cannot work in", async () => {
    const { call } = await agent();
    expect(await call("open_room", { room: ROOM })).toMatch(/Nobody has this room open/);
    expect(
      await call("open_room", { room: `https://arconis.ahara.io/#locked=${ROOM}&item=selected` })
    ).toMatch(/password room/);
    expect(
      await call("open_room", { room: `https://arconis.ahara.io/#local=${ROOM}&item=selected` })
    ).toMatch(/only in one browser/);
    expect(await call("read")).toMatch(/Call open_room/);
  });

  it("stops editing once everyone has left, since nothing would be kept", async () => {
    const alice = await person();
    const { call } = await agent();
    await call("open_room", { room: ROOM });
    alice.provider.destroy();
    await expect.poll(() => relay.peopleIn(ROOM)).toBe(0);
    expect(await call("write", { statements: 'node lost "Lost"' })).toMatch(/Everyone has left/);
  });

  it("does not keep the relay running for agents alone", async () => {
    await person();
    const { call } = await agent();
    await call("open_room", { room: ROOM });
    expect(relay.connectionCount).toBe(1);
  });
});
