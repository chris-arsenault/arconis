import { describe, expect, it, vi } from "vitest";
import { AccountsApi, type AccountServices } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";
import { AccountStore, startingName, type Fetcher } from "./accountStore";
import type { Auth } from "./auth";
import { isSealed, type SavedCopy } from "./workspaceFile";

const ID = "11111111-1111-4111-8111-111111111111";
const ROOM = "ab".repeat(24);
const EMAIL = "ada@example.com";

/** The real API over an in-memory table and bucket, reached through the store's own fetch calls. */
function backend() {
  const table = memoryAccountTable();
  const objects = new Map<string, Uint8Array>();
  const services: AccountServices = {
    signUpload: (user, id) => Promise.resolve(`https://s3/${user}/${id}`),
    signDownload: (user, id) => Promise.resolve(`https://s3/${user}/${id}`),
    deleteObject: (user, id) => {
      objects.delete(`https://s3/${user}/${id}`);
      return Promise.resolve();
    },
    deleteLogin: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    newRevision: () => crypto.randomUUID(),
  };
  const api = new AccountsApi(table, services);
  const request: Fetcher = async (url, init) => {
    if (url.startsWith("https://s3/")) {
      if (init?.method === "PUT") {
        objects.set(url, new Uint8Array(await (init.body as Blob).arrayBuffer()));
        return new Response("{}");
      }
      return new Response(new Uint8Array(objects.get(url)!));
    }
    const path = url.replace("https://api", "");
    const reply = await api.handle("ada", init?.method ?? "GET", path, String(init?.body ?? ""));
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return { request, objects, table, services };
}

/** Sign-in as the browser sees it: a session that exists or does not. */
function fakeAuth(signedIn = true) {
  const session = { signedIn, failure: "" };
  const auth: Auth = {
    completeSignIn: () =>
      session.failure ? Promise.reject(new Error(session.failure)) : Promise.resolve(),
    signIn: vi.fn(() => Promise.resolve()),
    token: () => Promise.resolve(session.signedIn ? "token" : null),
    email: () => Promise.resolve(session.signedIn ? EMAIL : null),
    signOut: vi.fn(() => {
      session.signedIn = false;
      return Promise.resolve();
    }),
  };
  return { auth, session };
}

function setup(signedIn = true) {
  const server = backend();
  const { auth, session } = fakeAuth(signedIn);
  const make = () => new AccountStore(auth, "https://api", server.request);
  return { ...server, auth, session, make, store: make() };
}

const COPY: SavedCopy = {
  roomId: ROOM,
  contents: { roomId: ROOM, update: new TextEncoder().encode("Quarterly plan"), pictures: [] },
};

describe("signing in", () => {
  it("creates the profile on the first sign-in, named from the email", async () => {
    const { store, table } = setup();
    await store.restore();
    expect(store.status).toBe("in");
    expect(store.email).toBe(EMAIL);
    expect(store.name).toBe("ada");
    expect(await table.profile("ada")).toMatchObject({ name: "ada" });
  });

  it("keeps a chosen name on later sign-ins", async () => {
    const { store, make } = setup();
    await store.restore();
    await store.rename("  Ada L  ");
    expect(store.name).toBe("Ada L");
    const later = make();
    await later.restore();
    expect(later.name).toBe("Ada L");
  });

  it("stays out with no session, and says why a sign-in came back refused", async () => {
    const { store, session } = setup(false);
    session.failure = "Activate your Arconis account from the email we sent.";
    await store.restore();
    expect(store.status).toBe("out");
    expect(store.error).toBe(session.failure);
  });

  it("starts names from the email's first part", () => {
    expect(startingName("grace.hopper@example.com")).toBe("grace.hopper");
    expect(startingName(null)).toBe("Me");
  });
});

describe("saved workspaces", () => {
  it("stores an ordinary room readable, and lists it by its title and room", async () => {
    const { store, objects } = setup();
    await store.restore();
    await store.save(ID, "Quarterly plan", COPY);
    expect(await store.workspaces()).toMatchObject([
      { id: ID, name: "Quarterly plan", roomId: ROOM },
    ]);
    const { copy } = await store.load(ID);
    expect(isSealed(copy)).toBe(false);
    if (!isSealed(copy))
      expect(new TextDecoder().decode(copy.contents.update)).toBe("Quarterly plan");
    expect(objects.size).toBe(1);
  });

  it("removes a workspace", async () => {
    const { store } = setup();
    await store.restore();
    await store.save(ID, "Plan", COPY);
    await store.removeWorkspace(ID);
    expect(await store.workspaces()).toEqual([]);
    await expect(store.load(ID)).rejects.toThrow(/no longer exists/);
  });
});

describe("the account", () => {
  it("signs out", async () => {
    const { store, auth } = setup();
    await store.restore();
    await store.signOut();
    expect(store.status).toBe("out");
    expect(store.name).toBe("");
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("deleting it removes everything, including the sign-in, and signs out", async () => {
    const { store, table, objects, services } = setup();
    await store.restore();
    await store.save(ID, "Plan", COPY);
    await store.deleteAccount();
    expect(store.status).toBe("out");
    expect(await table.profile("ada")).toBeNull();
    expect(objects.size).toBe(0);
    expect(services.deleteLogin).toHaveBeenCalledWith("ada");
  });
});
