import { expect, it, vi } from "vitest";
import { memoryAccountTable } from "./memoryTable";
import { AccountsApi, type AccountServices } from "./api";
import { libraryListSchema } from "../protocol/library";

function setup() {
  const table = memoryAccountTable();
  const revision = crypto.randomUUID();
  const services: AccountServices = {
    objectInfo: vi.fn(() => Promise.resolve({ size: 100, checksum: "checked" })),
    signUpload: (user, path) => Promise.resolve(`put:${user}/${path}`),
    signDownload: (user, path) => Promise.resolve(`get:${user}/${path}`),
    deleteObject: vi.fn(() => Promise.resolve()),
    deleteLogin: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    newRevision: () => revision,
  };
  const api = new AccountsApi(table, services);
  const id = crypto.randomUUID();
  const values = { name: "Reusable diagram", size: 100, checksum: "checked" };
  const call = (user: string, method: string, path = id, body: unknown = {}) =>
    api.handle(user, method, `/api/library/${path}`, JSON.stringify(body));
  const list = async (user: string) =>
    libraryListSchema.parse((await api.handle(user, "GET", "/api/library", "")).body).entries;
  return { table, services, revision, id, values, call, list, api };
}

it("publishes only a verified upload and isolates the layout from other accounts", async () => {
  const { call, list, values, revision, id, table } = setup();
  expect((await call("a", "PUT", id, values)).body).toMatchObject({ revision });
  expect(await list("a")).toEqual([]);
  expect((await call("a", "POST", id, { ...values, revision })).status).toBe(200);
  expect(await list("a")).toHaveLength(1);
  expect(await list("b")).toEqual([]);
  expect((await call("b", "GET")).status).toBe(404);
  expect((await call("b", "DELETE")).status).toBe(404);
  expect(table.bytes("a")).toBe(100);
  await call("a", "PUT", `${id}/name`, { name: "Renamed diagram" });
  expect((await list("a"))[0].name).toBe("Renamed diagram");
  await call("a", "DELETE");
  expect(await list("a")).toEqual([]);
  expect(table.bytes("a")).toBe(0);
});

it("keeps incomplete or damaged uploads out of the library", async () => {
  const { call, list, values, revision, id, services } = setup();
  vi.mocked(services.objectInfo).mockResolvedValueOnce(null);
  expect((await call("a", "POST", id, { ...values, revision })).status).toBe(400);
  vi.mocked(services.objectInfo).mockResolvedValueOnce({
    size: 100,
    checksum: "wrong",
  });
  expect((await call("a", "POST", id, { ...values, revision })).status).toBe(400);
  expect(await list("a")).toEqual([]);
});

it("removes a person's saved layouts when deleting their account", async () => {
  const { call, api, values, revision, id, table, services } = setup();
  await call("a", "POST", id, { ...values, revision });
  expect((await api.handle("a", "DELETE", "/api/me", "")).status).toBe(200);
  expect(await table.library("a")).toEqual([]);
  expect(services.deleteObject).toHaveBeenCalledWith("a", `sections/${id}/${revision}`);
});

it("charges a concurrent layout publication once and releases its bytes once on deletion", async () => {
  const { call, values, revision, id, table, list, services } = setup();
  const published = await Promise.all([
    call("a", "POST", id, { ...values, revision }),
    call("a", "POST", id, { ...values, revision }),
  ]);
  expect(published.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 409]);
  expect(table.bytes("a")).toBe(100);
  expect(table.total()).toBe(100);
  const [entry] = await list("a");
  const removed = await Promise.all([call("a", "DELETE"), call("a", "DELETE")]);
  expect(removed.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 404]);
  expect(table.bytes("a")).toBe(0);
  expect(table.total()).toBe(0);
  expect(services.deleteObject).toHaveBeenCalledOnce();
  expect(await table.renameLibrary("a", { ...entry, name: "Late rename" })).toBe(false);
  expect(await list("a")).toEqual([]);
});

it("blocks layout creation and rename after account deletion starts, while allowing removal", async () => {
  const { call, values, revision, id, table, list } = setup();
  await call("a", "POST", id, { ...values, revision });
  const [entry] = await list("a");
  await table.beginDelete("a");
  expect(await table.createLibrary("a", { ...entry, id: crypto.randomUUID() })).toBe("deleting");
  expect(await table.renameLibrary("a", { ...entry, name: "Late rename" })).toBe(false);
  expect(await table.deleteLibrary("a", entry)).toBe(true);
  expect(table.total()).toBe(0);
});
