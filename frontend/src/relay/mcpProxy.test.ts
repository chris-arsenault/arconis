import { expect, it, vi } from "vitest";
import { McpProxy, type AlbRequest } from "./mcpProxy";
import { base, config, person, ROOM } from "./agentTestHarness";
import { MCP_RELAY_PATH, type TokenVerifier } from "./mcpHttp";
import type { RelayStatus } from "../collaboration/serviceProtocol";

const verify: TokenVerifier = async (token) =>
  token === "alice" ? { user: "user-alice", clientId: "agents", scopes: ["edit:rooms"] } : null;

function event(method = "tools/call", params: object = {}): AlbRequest {
  return {
    path: "/mcp",
    httpMethod: "POST",
    headers: { authorization: "Bearer alice", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  };
}

it("keeps discovery and sign-in challenges available without a running relay", async () => {
  const upstream = vi.fn<typeof fetch>();
  const proxy = new McpProxy(config, verify, async () => "stopped", upstream);
  const metadata = await proxy.handle({
    path: "/.well-known/oauth-protected-resource/mcp",
    httpMethod: "GET",
  });
  expect(JSON.parse(metadata!.body)).toMatchObject({
    resource: config.resource,
    authorization_servers: [config.issuer],
  });
  const unsigned = await proxy.handle({ ...event(), headers: {} });
  expect(unsigned!.statusCode).toBe(401);
  expect(unsigned!.headers["www-authenticate"]).toContain("oauth-protected-resource/mcp");
  expect(
    (await proxy.handle({ ...event(), headers: { authorization: "Bearer invalid" } }))!.statusCode
  ).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});

it.each<RelayStatus>(["stopped", "starting", "stopping", "running", "limit"])(
  "explains %s availability through MCP instead of an ALB error page",
  async (state) => {
    const status = vi.fn(async () => state);
    const upstream = vi.fn<typeof fetch>(
      async () =>
        new Response("<html>503 Service Unavailable</html>", {
          status: 503,
          headers: { "content-type": "text/html" },
        })
    );
    const proxy = new McpProxy(config, verify, status, upstream);
    const result = await proxy.handle(
      event("tools/call", { name: "open_room", arguments: { room: ROOM } })
    );
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 7, result: { isError: true } });
    expect(body.result.content[0].text).toMatch(/Arconis relay/);
    expect(body.result.content[0].text).not.toContain("<html>");
    if (state === "limit") expect(body.result.content[0].text).toContain("monthly spending limit");
    else if (state !== "running") expect(body.result.content[0].text).toContain(state);
    const initialized = await proxy.handle(event("initialize"));
    expect(initialized!.statusCode).toBe(503);
    expect(JSON.parse(initialized!.body)).toMatchObject({ id: 7, error: { code: -32000 } });
    expect(initialized!.headers["retry-after"]).toBe("10");
  }
);

it("forwards actual discovery, explicit room sessions and writes without changing the bearer or body", async () => {
  const alice = await person();
  const upstream = vi.fn<typeof fetch>((url, init) => {
    expect(String(url)).toBe("https://relay.example/mcp/relay");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer alice");
    return fetch(new URL(MCP_RELAY_PATH, base), init);
  });
  const status = vi.fn(async () => "running" as const);
  const proxy = new McpProxy(config, verify, status, upstream);
  const listed = await proxy.handle(event("tools/list"));
  const tools = JSON.parse(listed!.body).result.tools as { name: string }[];
  expect(tools.some((tool) => tool.name === "write")).toBe(true);
  const opened = await proxy.handle(
    event("tools/call", { name: "open_room", arguments: { room: ROOM } })
  );
  const { session_id } = JSON.parse(opened!.body).result.structuredContent;
  const write = event("tools/call", {
    name: "write",
    arguments: { session_id, statements: 'node n "Through proxy" at 0,0' },
  });
  write.isBase64Encoded = true;
  write.body = Buffer.from(write.body!).toString("base64");
  const written = await proxy.handle(write);
  expect(JSON.parse(written!.body).result.isError).toBe(false);
  await expect.poll(() => alice.document.get("n")?.name).toBe("Through proxy");
  expect(status).not.toHaveBeenCalled();
  expect(upstream).toHaveBeenCalledTimes(3);
});

it("preserves upstream authentication and verifier errors without calling them stopped relays", async () => {
  const status = vi.fn(async () => "stopped" as const);
  for (const code of [401, 429, 503]) {
    const upstream: typeof fetch = async () =>
      new Response('{"error":"upstream explanation"}', {
        status: code,
        headers: { "content-type": "application/json", "retry-after": "12" },
      });
    const response = await new McpProxy(config, verify, status, upstream).handle(event());
    expect(response!.statusCode).toBe(code);
    expect(response!.body).toBe('{"error":"upstream explanation"}');
    expect(response!.headers["retry-after"]).toBe("12");
  }
  expect(status).not.toHaveBeenCalled();
});

it("never retries writes after a lost response and reports their outcome as unverified", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const upstream = vi.fn<typeof fetch>(async () => {
    throw new Error("Connection lost");
  });
  const result = await new McpProxy(config, verify, async () => "running", upstream).handle(
    event()
  );
  expect(JSON.parse(result!.body).result.content[0].text).toContain(
    "outcome of any edit is unverified"
  );
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("distinguishes a verifier outage and a status outage, and rejects malformed requests", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const upstream = vi.fn<typeof fetch>(async () => new Response("Unavailable", { status: 503 }));
  const outage = async () => {
    throw new Error("Service unavailable");
  };
  const auth = await new McpProxy(config, outage, async () => "running", upstream).handle(event());
  expect(auth!.statusCode).toBe(503);
  expect(auth!.headers).not.toHaveProperty("www-authenticate");
  expect(upstream).not.toHaveBeenCalled();
  const proxy = new McpProxy(config, verify, outage, upstream);
  const unavailable = await proxy.handle(event());
  expect(JSON.parse(unavailable!.body).result.content[0].text).toContain(
    "status could not be checked"
  );
  expect((await proxy.handle({ ...event(), body: "invalid" }))!.statusCode).toBe(400);
  expect((await proxy.handle({ ...event(), body: "null" }))!.statusCode).toBe(400);
  expect((await proxy.handle({ ...event(), httpMethod: "GET" }))!.statusCode).toBe(405);
  expect(await proxy.handle({ ...event(), path: "/control/status" })).toBeNull();
});
