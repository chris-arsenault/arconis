import { describe, expect, it, vi } from "vitest";
import {
  AccountsApi,
  MAX_NAME_LENGTH,
  MAX_WORKSPACES,
  MAX_WORKSPACE_BYTES,
  tokenSubject,
  type AccountServices,
} from "./api";
import { memoryAccountTable } from "./memoryTable";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ROOM = "ab".repeat(24);

function setup() {
  const table = memoryAccountTable();
  const services = {
    objectInfo: vi.fn<AccountServices["objectInfo"]>(async () => ({ size: 100, checksum: "abc=" })),
    signUpload: vi.fn((user: string, id: string) => Promise.resolve(`put:${user}:${id}`)),
    signDownload: vi.fn((user: string, id: string) => Promise.resolve(`get:${user}:${id}`)),
    deleteObject: vi.fn(() => Promise.resolve()),
    deleteLogin: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    newRevision: () => crypto.randomUUID(),
  };
  const api = new AccountsApi(table, services);
  const save = async (user: string, id: string, size = 100, values: object = {}) => {
    const expectedRevision = (await table.workspace(user, id))?.revision ?? "";
    const metadata = {
      size,
      checksum: "abc=",
      name: "Roadmap",
      roomId: ROOM,
      expectedRevision,
      ...values,
    };
    const reply = await api.handle(user, "PUT", `/api/workspaces/${id}`, JSON.stringify(metadata));
    if (reply.status !== 200) return reply;
    if (!("revision" in reply.body)) throw new Error("Expected upload metadata.");
    services.objectInfo.mockResolvedValue({ size, checksum: "abc=" });
    const published = await api.handle(
      user,
      "POST",
      `/api/workspaces/${id}`,
      JSON.stringify({ ...metadata, revision: reply.body.revision })
    );
    return published.status === 200 ? reply : published;
  };
  return { api, table, services, save };
}

describe("profiles", () => {
  it("stores a name, and has nothing before that", async () => {
    const { api } = setup();
    expect((await api.handle("a", "GET", "/api/me", "")).status).toBe(404);
    const body = JSON.stringify({ name: "  Ada  " });
    expect((await api.handle("a", "PUT", "/api/me", body)).status).toBe(200);
    const { status, body: profile } = await api.handle("a", "GET", "/api/me", "");
    expect(status).toBe(200);
    expect(profile).toMatchObject({ name: "Ada", bytes: 0 });
  });

  it.each([
    ["no name", { name: " " }],
    ["a long name", { name: "x".repeat(MAX_NAME_LENGTH + 1) }],
  ])("refuses %s", async (_, values) => {
    const { api } = setup();
    const body = JSON.stringify(values);
    expect((await api.handle("a", "PUT", "/api/me", body)).status).toBe(400);
  });

  it("refuses a body that is not JSON", async () => {
    const { api } = setup();
    expect((await api.handle("a", "PUT", "/api/me", "not json")).status).toBe(400);
  });
});

describe("workspaces", () => {
  it("signs an upload, lists the record, and signs a download", async () => {
    const { api, save } = setup();
    expect((await save("a", ID)).body).toEqual({
      url: expect.stringContaining(`put:a:snapshots/${ID}/`),
      revision: expect.any(String),
    });
    expect((await api.handle("a", "GET", "/api/workspaces", "")).body).toEqual({
      workspaces: [
        {
          id: ID,
          name: "Roadmap",
          roomId: ROOM,
          size: 100,
          revision: expect.any(String),
          updated: 1000,
        },
      ],
    });
    expect((await api.handle("a", "GET", `/api/workspaces/${ID}`, "")).body).toMatchObject({
      url: expect.stringContaining(`get:a:snapshots/${ID}/`),
      revision: expect.any(String),
    });
  });

  it("keeps one person's workspaces from another", async () => {
    const { api, save } = setup();
    await save("a", ID);
    expect((await api.handle("b", "GET", `/api/workspaces/${ID}`, "")).status).toBe(404);
    expect((await api.handle("b", "DELETE", `/api/workspaces/${ID}`, "")).status).toBe(404);
    expect((await api.handle("b", "GET", "/api/workspaces", "")).body).toEqual({ workspaces: [] });
  });

  it("refuses anything but a workspace identifier, so nothing can reach another key", async () => {
    const { api } = setup();
    for (const id of ["..", "%2e%2e", "x", `${ID}/more`])
      expect((await api.handle("a", "GET", `/api/workspaces/${id}`, "")).status).toBe(404);
  });

  it.each([
    ["zero bytes", 0],
    ["a fractional size", 1.5],
    ["too many bytes", MAX_WORKSPACE_BYTES + 1],
  ])("refuses %s", async (_, size) => {
    const { save } = setup();
    expect((await save("a", ID, size)).status).toBe(400);
  });
});

describe("workspace storage limits", () => {
  it("counts all retained revisions and refuses past the account's limit", async () => {
    const { save, table } = setup();
    await save("a", ID, 100);
    await save("a", ID, 40);
    expect(table.bytes("a")).toBe(140);
    table.setBytes("a", 1024 ** 3 - 10);
    expect((await save("a", OTHER, 20)).status).toBe(409);
    expect((await save("a", OTHER, 5)).status).toBe(200);
  });

  it("refuses past the service's total, whoever is asking", async () => {
    const { save, table } = setup();
    table.setTotal(20 * 1024 ** 3 - 5);
    expect((await save("a", ID, 6)).status).toBe(409);
    expect((await save("a", ID, 5)).status).toBe(200);
  });

  it("limits how many workspaces an account holds", async () => {
    const { save } = setup();
    for (let index = 0; index < MAX_WORKSPACES; index++)
      await save("a", `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`);
    expect((await save("a", ID)).status).toBe(409);
  });

  it("frees storage on delete", async () => {
    const { api, save, table, services } = setup();
    await save("a", ID, 100);
    expect((await api.handle("a", "DELETE", `/api/workspaces/${ID}`, "")).status).toBe(200);
    expect(table.bytes("a")).toBe(0);
    expect(services.deleteObject).toHaveBeenCalledWith(
      "a",
      expect.stringContaining(`snapshots/${ID}/`)
    );
  });
});

describe("workspace records", () => {
  it("advertises only completed uploads and retains the last usable copy after an upload failure", async () => {
    const { api, save, table, services } = setup();
    await save("a", ID);
    const before = (await table.workspace("a", ID))!;
    const metadata = {
      size: 100,
      checksum: "abc=",
      name: "Failed replacement",
      roomId: ROOM,
      expectedRevision: before.revision,
    };
    const prepared = await api.handle(
      "a",
      "PUT",
      `/api/workspaces/${ID}`,
      JSON.stringify(metadata)
    );
    expect(await table.workspace("a", ID)).toEqual(before);
    if (!("revision" in prepared.body)) throw new Error("Expected prepared upload.");
    services.objectInfo.mockResolvedValueOnce(null);
    expect(
      (
        await api.handle(
          "a",
          "POST",
          `/api/workspaces/${ID}`,
          JSON.stringify({ ...metadata, revision: prepared.body.revision })
        )
      ).status
    ).toBe(400);
    expect(await table.workspace("a", ID)).toEqual(before);
    expect(await table.workspaceHistory("a", ID)).toEqual([before]);
  });

  it("retains five timestamped successful revisions and accounts for pruned storage", async () => {
    const { api, save, table, services } = setup();
    for (let index = 0; index < 7; index++) await save("a", ID, 100, { name: `Copy ${index}` });
    const history = await table.workspaceHistory("a", ID);
    expect(history.map(({ name }) => name)).toEqual([
      "Copy 6",
      "Copy 5",
      "Copy 4",
      "Copy 3",
      "Copy 2",
    ]);
    expect(
      history.every((entry, index) => index === 0 || entry.updated < history[index - 1].updated)
    ).toBe(true);
    expect(table.bytes("a")).toBe(500);
    expect(services.deleteObject).toHaveBeenCalledTimes(2);
    const revision = history.at(-1)!.revision;
    expect(
      (await api.handle("a", "GET", `/api/workspaces/${ID}/revisions/${revision}`, "")).status
    ).toBe(200);
    expect(
      (await api.handle("b", "GET", `/api/workspaces/${ID}/revisions/${revision}`, "")).status
    ).toBe(404);
    await api.handle("a", "DELETE", `/api/workspaces/${ID}`, "");
    expect(table.bytes("a")).toBe(0);
    expect(await table.workspaceHistory("a", ID)).toEqual([]);
  });
});

describe("workspace publication", () => {
  it("rejects reuse of current and retained revisions without pruning their data", async () => {
    const { api, save, table, services } = setup();
    await save("a", ID);
    await save("a", ID);
    const history = await table.workspaceHistory("a", ID);
    for (const entry of history) {
      const body = { ...entry, checksum: "abc=", expectedRevision: history[0].revision };
      const reply = await api.handle("a", "POST", `/api/workspaces/${ID}`, JSON.stringify(body));
      expect(reply.status).toBe(400);
    }
    expect(await table.workspaceHistory("a", ID)).toEqual(history);
    expect(table.bytes("a")).toBe(200);
    expect(services.deleteObject).not.toHaveBeenCalled();
  });

  it("allows only one simultaneous publication against the same base revision", async () => {
    const { api, save, table } = setup();
    await save("a", ID);
    const before = (await table.workspace("a", ID))!;
    const metadata = {
      size: 100,
      checksum: "abc=",
      name: "Concurrent save",
      roomId: ROOM,
      expectedRevision: before.revision,
    };
    const attempts = await Promise.all(
      [0, 1].map(() => api.handle("a", "PUT", `/api/workspaces/${ID}`, JSON.stringify(metadata)))
    );
    const committed = await Promise.all(
      attempts.map((attempt) => {
        if (!("revision" in attempt.body)) throw new Error("Expected prepared upload.");
        return api.handle(
          "a",
          "POST",
          `/api/workspaces/${ID}`,
          JSON.stringify({ ...metadata, revision: attempt.body.revision })
        );
      })
    );
    expect(committed.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(await table.workspaceHistory("a", ID)).toHaveLength(2);
    expect(table.bytes("a")).toBe(200);
  });

  it("accepts every kind of room, and refuses a name or room that is not one", async () => {
    const { save } = setup();
    for (const roomId of [ROOM, `locked-${ROOM}`, `local-${ROOM}`])
      expect((await save("a", ID, 100, { roomId })).status).toBe(200);
    expect((await save("a", ID, 100, { roomId: "../other" })).status).toBe(400);
    expect((await save("a", ID, 100, { name: "x".repeat(201) })).status).toBe(400);
  });
});

describe("deleting an account", () => {
  it("removes workspaces, profile and login", async () => {
    const { api, save, table, services } = setup();
    await api.handle("a", "PUT", "/api/me", JSON.stringify({ name: "A" }));
    await save("a", ID, 100);
    expect((await api.handle("a", "DELETE", "/api/me", "")).status).toBe(200);
    expect(await table.profile("a")).toBeNull();
    expect(await table.workspaces("a")).toEqual([]);
    expect(table.total()).toBe(0);
    expect(services.deleteLogin).toHaveBeenCalledWith("a");
  });
});

describe("account deletion guards", () => {
  it("rejects publication already in flight when deletion begins", async () => {
    const { api, table, services } = setup();
    let release!: () => void;
    let uploaded!: () => void;
    const waiting = new Promise<void>((resolve) => {
      uploaded = resolve;
    });
    services.objectInfo.mockImplementationOnce(async () => {
      uploaded();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { size: 100, checksum: "abc=" };
    });
    const publishing = api.handle(
      "a",
      "POST",
      `/api/workspaces/${ID}`,
      JSON.stringify({
        size: 100,
        checksum: "abc=",
        name: "Concurrent",
        roomId: ROOM,
        expectedRevision: "",
        revision: crypto.randomUUID(),
      })
    );
    await waiting;
    expect((await api.handle("a", "DELETE", "/api/me", "")).status).toBe(200);
    release();
    expect((await publishing).status).toBe(409);
    expect(await table.workspaces("a")).toEqual([]);
    expect(table.total()).toBe(0);
  });

  it("keeps deletion retryable and refuses recreation with a still-valid token", async () => {
    const { api, save, table, services } = setup();
    await save("a", ID);
    services.deleteLogin.mockRejectedValueOnce(new Error("Sign-in service unavailable"));
    await expect(api.handle("a", "DELETE", "/api/me", "")).rejects.toThrow(
      "Sign-in service unavailable"
    );
    expect(await table.isDeleting("a")).toBe(true);
    expect(await table.saveProfile("a", { name: "Recreated" })).toBe(false);
    expect(
      (await api.handle("a", "PUT", "/api/me", JSON.stringify({ name: "Recreated" }))).status
    ).toBe(409);
    expect((await save("a", OTHER)).status).toBe(409);
    expect((await api.handle("a", "DELETE", "/api/me", "")).status).toBe(200);
    expect(await table.isDeleting("a")).toBe(true);
    expect(table.total()).toBe(0);
  });
  it("blocks a smaller replacement after deletion starts while allowing cleanup decrements", async () => {
    const { save, table } = setup();
    for (let n = 0; n < 5; n++) await save("a", ID);
    const history = await table.workspaceHistory("a", ID);
    await table.beginDelete("a");
    expect(
      await table.commitWorkspace(
        "a",
        {
          ...history[0],
          revision: crypto.randomUUID(),
          size: 1,
          updated: 2000,
        },
        history[0].revision,
        history.slice(4)
      )
    ).toBe("deleting");
    expect(table.bytes("a")).toBe(500);
    expect(await table.deleteWorkspace("a", history[0])).toBe(true);
    expect(table.total()).toBe(0);
  });
});

it("answers only its own routes", async () => {
  const { api } = setup();
  for (const path of ["/other", "/api", "/api/other", "/api/me/extra"])
    expect((await api.handle("a", "GET", path, "")).status).toBe(404);
  expect((await api.handle("a", "POST", "/api/me", "")).status).toBe(404);
});

it("preserves empty deletion replies and not-found responses for every unsupported method", async () => {
  const { api, save } = setup();
  const absent = { status: 404, body: { error: "Not found" } };
  expect(await api.handle("a", "GET", "/api/me", "")).toEqual(absent);
  expect(await api.handle("a", "GET", `/api/workspaces/${ID}`, "")).toEqual(absent);
  expect(await api.handle("a", "DELETE", `/api/workspaces/${ID}`, "")).toEqual(absent);
  await save("a", ID);
  for (const [method, path] of [
    ["POST", "/api/me"],
    ["PUT", "/api/workspaces"],
    ["DELETE", "/api/workspaces"],
    ["POST", `/api/workspaces/${ID}/unsupported`],
  ])
    expect(await api.handle("a", method, path, "")).toEqual(absent);
  expect(await api.handle("a", "DELETE", `/api/workspaces/${ID}`, "")).toEqual({
    status: 200,
    body: {},
  });
  expect(await api.handle("a", "DELETE", "/api/me", "")).toEqual({ status: 200, body: {} });
});

it.each(["not json", "null", "[]", '{"size":100}', '{"name":7}'])(
  "validates untrusted request bodies independently of shared TypeScript types: %s",
  async (body) => {
    const { api, services } = setup();
    expect((await api.handle("a", "PUT", `/api/workspaces/${ID}`, body)).status).toBe(400);
    expect((await api.handle("a", "PUT", "/api/me", body)).status).toBe(400);
    expect(services.signUpload).not.toHaveBeenCalled();
  }
);

describe("reading a token's subject", () => {
  const token = (claims: object) =>
    `Bearer h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  it("finds it, and gives nothing for anything malformed", () => {
    expect(tokenSubject(token({ sub: "abc" }))).toBe("abc");
    expect(tokenSubject(token({}))).toBeNull();
    expect(tokenSubject("Bearer nonsense")).toBeNull();
    expect(tokenSubject("Bearer a.%%%.c")).toBeNull();
    expect(tokenSubject(undefined)).toBeNull();
  });
});
