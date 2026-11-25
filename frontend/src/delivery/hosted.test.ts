import { expect, it } from "vitest";
import { DeliveryClient } from "./client";
import { DeliveryService, newProject, type DeliveryStorage, type Head } from "./hosted";
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
  const objects = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const writes: string[] = [];
  const stages = new Map<string, string>();
  const storage: DeliveryStorage = {
    list: (user) =>
      Promise.resolve(
        [...heads].filter(([key]) => key.startsWith(user + "/")).map(([, x]) => x.head)
      ),
    readHead: (user, p) => Promise.resolve(heads.get(`${user}/${p}`) ?? null),
    readObject: (user, p, name) => {
      reads.push(name);
      const value = objects.get(`/${user}/${p}/${name}`);
      if (!value) throw new Error("No stored object.");
      return Promise.resolve(value);
    },
    writeObject: (user, p, name, body) => {
      writes.push(name);
      const key = `/${user}/${p}/${name}`;
      if (!objects.has(key)) objects.set(key, typeof body === "string" ? Buffer.from(body) : body);
      return Promise.resolve();
    },
    hasObject: (user, p, name) => Promise.resolve(objects.has(`/${user}/${p}/${name}`)),
    signObject: (user, p, name) => Promise.resolve(`${base}/${user}/${p}/${name}`),
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
    const object = objects.get(p);
    return object ? new Response(Uint8Array.from(object)) : new Response(null, { status: 404 });
  };
  return {
    service,
    storage,
    reads,
    writes,
    client: new DeliveryClient(base, () => Promise.resolve("author"), request),
  };
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

it("reads and changes one source body, then searches the current corpus through MCP", async () => {
  const { service, storage, reads, writes } = fixture();
  const call = mcpCalls(service);
  const { project } = await service.create("author", "Design sources");
  await call("file_write", {
    project,
    kind: "design",
    path: "lore.md",
    title: "Lore",
    tags: ["lore"],
    body: "# Lore\n\n## The old bridge {#bridge}\n\nThe river toll is three coins.\n\n## Customs\n\nLeave the water to the ferryman.\n",
  });
  await call("file_write", {
    project,
    kind: "design",
    path: "architecture.md",
    title: "Architecture",
    tags: ["architecture"],
    body: "# Region\n\nThe river feeds the lower valley.",
  });
  await call("file_write", {
    project,
    kind: "artifact",
    path: "render.png",
    title: "Render",
    format: "base64",
    body: "aGVsbG8=",
  });

  reads.length = 0;
  writes.length = 0;
  const section = await call("file_read", { project, target: "lore.md", section: "bridge" });
  expect(section).toMatchObject({ body: "The river toll is three coins." });
  expect(reads.filter((name) => name.startsWith("content/"))).toHaveLength(1);

  reads.length = 0;
  const edit = (body: string) =>
    call("design_edit", { project, target: "lore.md", section: "bridge", body });
  await edit("The river toll is one copper coin.");
  expect(reads.filter((name) => name.startsWith("content/"))).toHaveLength(1);
  expect(writes.filter((name) => name.startsWith("content/"))).toHaveLength(1);
  await edit("The river toll is one silver coin.");
  expect(writes.filter((name) => name.startsWith("search/"))).toHaveLength(0);

  const query = { project, query: "river toll", tag: "lore" };
  const results = await call("file_search", query);
  expect(results).toEqual([
    expect.objectContaining({
      path: "lore.md",
      section: "bridge",
      excerpt: "The river toll is one silver coin.",
    }),
  ]);
  expect(writes.filter((name) => name.startsWith("search/"))).toHaveLength(1);
  expect(await call("file_search", { project, query: "copper" })).toEqual([]);

  await call("work_edit", { project, target: "Design sources", fields: { note: "Still active" } });
  await call("file_write", {
    project,
    kind: "artifact",
    path: "render.png",
    title: "Render",
    format: "base64",
    body: "d29ybGQ=",
  });
  reads.length = 0;
  expect(await call("file_search", query)).toEqual(results);
  expect(reads.filter((name) => !name.startsWith("versions/"))).toEqual([]);
  const cold = mcpCalls(new DeliveryService(storage, base));
  expect(await cold("file_search", query)).toEqual(results);
  expect(reads.filter((name) => name.startsWith("content/"))).toHaveLength(0);
  expect(reads.filter((name) => name.startsWith("search/"))).toHaveLength(1);
  expect(writes.filter((name) => name.startsWith("search/"))).toHaveLength(1);
});

it("opens an inline project and preserves its history in subsequent portable exports", async () => {
  const { service, storage, client } = fixture();
  const actor = hostedActor("author");
  const legacy = newProject("Legacy project", actor);
  legacy.server = `${base}/api/delivery/${legacy.id}`;
  const text = "# Roads\n\nAn old plan with a café.\n";
  runDelivery(legacy, actor, {
    operation: "file_write",
    args: { path: "roads.md", kind: "design", title: "Roads", body: text },
  });
  const bytes = canonical(legacy);
  await storage.writeObject("author", legacy.id, "versions/legacy.json", bytes);
  await storage.publish(
    "author",
    { project: legacy.id, title: legacy.title, revision: "legacy", size: Buffer.byteLength(bytes) },
    null
  );
  expect(await client.read(legacy.id)).toEqual(legacy);
  await mcpCalls(service)("design_edit", {
    project: legacy.id,
    target: "roads.md",
    section: "Roads",
    body: "A revised plan.",
  });
  const current = await client.read(legacy.id);
  expect(current.documents.map((doc) => doc.body)).toEqual([
    text,
    "# Roads\n\nA revised plan.\n\n",
  ]);
  expect((await service.download("author", legacy.id)).size).toBe(
    Buffer.byteLength(canonical(current))
  );
  expect(canonical(await client.sync(current))).toBe(canonical(current));
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
