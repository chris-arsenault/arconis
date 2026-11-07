import { describe, expect, it, vi } from "vitest";
import { createEnvelope, generateRoomKey } from "../collaboration/roomKey";
import {
  AccountsApi,
  MAX_NAME_LENGTH,
  MAX_WORKSPACES,
  MAX_WORKSPACE_BYTES,
  tokenSubject,
} from "./api";
import { memoryAccountTable } from "./memoryTable";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function setup() {
  const table = memoryAccountTable();
  const services = {
    signUpload: vi.fn((user: string, id: string) => Promise.resolve(`put:${user}:${id}`)),
    signDownload: vi.fn((user: string, id: string) => Promise.resolve(`get:${user}:${id}`)),
    deleteObject: vi.fn(() => Promise.resolve()),
    deleteLogin: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    newRevision: () => "revision",
  };
  const api = new AccountsApi(table, services);
  const save = (user: string, id: string, size = 100) =>
    api.handle(
      user,
      "PUT",
      `/api/workspaces/${id}`,
      JSON.stringify({ size, checksum: "abc=", sealedName: "sealed" })
    );
  return { api, table, services, save };
}

const envelope = async () => createEnvelope("password", await generateRoomKey(), 1);

describe("profiles", () => {
  it("stores a name and key envelope, and has nothing before that", async () => {
    const { api } = setup();
    expect((await api.handle("a", "GET", "/api/me", "")).status).toBe(404);
    const body = JSON.stringify({ name: "  Ada  ", envelope: await envelope() });
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
    const body = JSON.stringify({ envelope: await envelope(), ...values });
    expect((await api.handle("a", "PUT", "/api/me", body)).status).toBe(400);
  });

  it("refuses a malformed envelope, and a body that is not JSON", async () => {
    const { api } = setup();
    const bad = JSON.stringify({ name: "Ada", envelope: { salt: 5 } });
    expect((await api.handle("a", "PUT", "/api/me", bad)).status).toBe(400);
    expect((await api.handle("a", "PUT", "/api/me", "not json")).status).toBe(400);
  });
});

describe("workspaces", () => {
  it("signs an upload, lists the record, and signs a download", async () => {
    const { api, save } = setup();
    expect((await save("a", ID)).body).toEqual({ url: `put:a:${ID}`, revision: "revision" });
    expect((await api.handle("a", "GET", "/api/workspaces", "")).body).toEqual({
      workspaces: [
        { id: ID, sealedName: "sealed", size: 100, revision: "revision", updated: 1000 },
      ],
    });
    expect((await api.handle("a", "GET", `/api/workspaces/${ID}`, "")).body).toMatchObject({
      url: `get:a:${ID}`,
      revision: "revision",
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

  it("counts storage by the change a save makes, and refuses past the account's limit", async () => {
    const { save, table } = setup();
    await save("a", ID, 100);
    await save("a", ID, 40);
    expect(table.bytes("a")).toBe(40);
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
    expect(services.deleteObject).toHaveBeenCalledWith("a", ID);
  });
});

describe("deleting an account", () => {
  it("removes workspaces, profile and login", async () => {
    const { api, save, table, services } = setup();
    await api.handle(
      "a",
      "PUT",
      "/api/me",
      JSON.stringify({ name: "A", envelope: await envelope() })
    );
    await save("a", ID, 100);
    expect((await api.handle("a", "DELETE", "/api/me", "")).status).toBe(200);
    expect(await table.profile("a")).toBeNull();
    expect(await table.workspaces("a")).toEqual([]);
    expect(table.total()).toBe(0);
    expect(services.deleteLogin).toHaveBeenCalledWith("a");
  });
});

it("answers only its own routes", async () => {
  const { api } = setup();
  for (const path of ["/other", "/api", "/api/other", "/api/me/extra"])
    expect((await api.handle("a", "GET", path, "")).status).toBe(404);
  expect((await api.handle("a", "POST", "/api/me", "")).status).toBe(404);
});

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
