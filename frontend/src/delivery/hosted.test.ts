import { expect, it } from "vitest";
import { DeliveryClient } from "./client";
import { DeliveryService, type DeliveryStorage, type Head } from "./hosted";
import { deliveryFailure, deliveryRequest } from "./http";
import { deliveryMcp } from "./mcp";
import { canonical, currentDocuments, mergeProject, type Project } from "./project";
import { runDelivery } from "./actions";
import { hostedActor } from "./hosted";

const base = "http://localhost";
const data = (value: unknown) =>
  value as { structuredContent: { data: unknown }; isError?: boolean };
function fixture() {
  const heads = new Map<string, { head: Head; etag: string }>();
  const versions = new Map<string, string>();
  const stages = new Map<string, string>();
  const storage: DeliveryStorage = {
    list: (user) =>
      Promise.resolve(
        [...heads].filter(([key]) => key.startsWith(user + "/")).map(([, x]) => x.head)
      ),
    readHead: (user, p) => Promise.resolve(heads.get(`${user}/${p}`) ?? null),
    readVersion: (user, p, v) => Promise.resolve(versions.get(`/${user}/${p}/versions/${v}`) ?? ""),
    writeVersion: (user, p, v, body) => {
      versions.set(`/${user}/${p}/versions/${v}`, body);
      return Promise.resolve();
    },
    publish: (user, head, etag) => {
      const key = `${user}/${head.project}`;
      if ((heads.get(key)?.etag ?? null) !== etag) return Promise.resolve(false);
      heads.set(key, { head, etag: head.revision });
      return Promise.resolve(true);
    },
    stage: (user, p, t, size, checksum) =>
      Promise.resolve({
        url: `${base}/${user}/${p}/stage/${t}`,
        headers: { checksum, size: String(size) },
      }),
    readStage: (user, p, t) => Promise.resolve(stages.get(`/${user}/${p}/stage/${t}`) ?? ""),
    getVersion: (user, p, v) => Promise.resolve(`${base}/${user}/${p}/versions/${v}`),
    asset: () => Promise.resolve(base + "/asset"),
  };
  const service = new DeliveryService(storage, base);
  const request = async (url: string | URL, init?: RequestInit) => {
    const req = new Request(url, init);
    const p = new URL(req.url).pathname;
    if (p.startsWith("/api/delivery")) {
      const user = req.headers.get("authorization")?.slice(7) ?? "";
      try {
        return Response.json(await deliveryRequest(service, user, req.method, p, await req.text()));
      } catch (error) {
        const failure = deliveryFailure(error);
        return Response.json(failure.body, { status: failure.status });
      }
    }
    if (req.method === "PUT") {
      const bytes = Buffer.from(await req.arrayBuffer());
      expect(bytes.length).toBe(Number(req.headers.get("size")));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      expect(Buffer.from(digest).toString("base64")).toBe(req.headers.get("checksum"));
      stages.set(p, bytes.toString("base64"));
      return new Response(null, { status: 200 });
    }
    return new Response(versions.get(p) ?? null);
  };
  return { service, client: new DeliveryClient(base, () => Promise.resolve("author"), request) };
}

it("hands off through MCP, syncs offline work and evidence, and returns feedback across another sync", async () => {
  const { service, client } = fixture();
  const call = mcpCalls(service);
  const project = ((await call("create_project", { title: "City" })) as { project: string })
    .project;
  await call("work_add", { project, title: "Districts" });
  await call("file_write", {
    project,
    path: "districts.dataset.json",
    title: "District types",
    kind: "dataset",
    body: canonical({
      schema: { keys: ["Name"], fields: { Name: { type: "string" } } },
      items: [{ Name: "Grand Bazaar" }],
    }),
  });
  await call("batch_edit", {
    project,
    target: "Districts",
    edits: [
      "work edit Districts --next 'Preserve the outline'",
      "link add work:Districts 'districts.dataset.json#[\"Grand Bazaar\"]' --purpose basis",
    ],
  });
  const local = await client.read(project);
  const actor = hostedActor("Terminal");
  const result = runDelivery(local, actor, {
    operation: "result_add",
    args: { target: "Districts", observation: "Example render" },
  }) as { id: string };
  runDelivery(local, actor, {
    operation: "file_write",
    args: {
      path: "evidence/city.png",
      title: "Example screenshot",
      kind: "artifact",
      format: "base64",
      body: "aGVsbG8=",
    },
  });
  runDelivery(local, actor, {
    operation: "link_add",
    args: { from: `result:${result.id}`, to: "evidence/city.png", purpose: "evidence" },
  });
  await call("work_add", { project, title: "Independent work" });
  const synced = await client.sync(local);
  expect(currentDocuments(synced).map((doc) => doc.path)).toContain("evidence/city.png");
  expect(canonical(await client.sync(synced))).toBe(canonical(synced));
  const view = (await call("work_read", { project, target: "Districts" })) as {
    result: { id: string; artifacts: unknown[] };
  };
  expect(view.result.id).toBe(result.id);
  expect(view.result.artifacts).toHaveLength(1);
  await call("review_add", { project, target: "Districts", accepted: "Roads", remaining: "Parks" });
  const next = await client.sync(synced);
  expect(next.work.some((e) => e.type === "review" && e.accepted === "Roads")).toBe(true);
  expect(next.work.some((e) => e.type === "work.add" && e.item.title === "Independent work")).toBe(
    true
  );
  expect(await service.list("another account")).toEqual([]);
});
it("keeps losing versions in audit and never restores a newer deleted file from an older copy", () => {
  const id = "local";
  const empty: Project = {
    format: 1,
    id,
    title: "Local",
    root: "root",
    server: null,
    documents: [],
    work: [],
  };
  const body = {
    document: "doc",
    path: "city.md",
    title: "City",
    kind: "design" as const,
    format: "text" as const,
    tags: [],
    actor: "Human",
  };
  const old = { ...body, id: "old", at: "2026-01-01T00:00:00.000Z", body: "Old" };
  const deleted = { ...body, id: "new", at: "2026-01-02T00:00:00.000Z", body: null };
  const joined = mergeProject(
    { ...empty, documents: [old] },
    { ...empty, documents: [old, deleted] }
  );
  expect(joined.documents).toEqual([old, deleted]);
  expect(currentDocuments(joined)).toEqual([]);
});
function mcpCalls(service: DeliveryService) {
  const mcp = deliveryMcp(service, base + "/delivery/mcp", base + "/", (token) =>
    Promise.resolve(
      token === "fixture" ? { user: "author", clientId: "web", scopes: ["edit:delivery"] } : null
    )
  );
  const rpc = async (method: string, params: object) => {
    const response = await mcp(
      new Request(base + "/delivery/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer fixture",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    );
    expect(response.status).toBe(200);
    const reply = (await response.json()) as { result: unknown; error?: unknown };
    expect(reply.error).toBeUndefined();
    return reply.result;
  };
  return async (name: string, args: object) => {
    const result = data(await rpc("tools/call", { name, arguments: args }));
    expect(result.isError, result.structuredContent?.data as string).not.toBe(true);
    return result.structuredContent.data;
  };
}
