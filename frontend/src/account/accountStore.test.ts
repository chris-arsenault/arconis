import { describe, expect, it, vi } from "vitest";
import { AccountsApi, type AccountServices } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";
import { AccountStore, type Fetcher, type KeyVault } from "./accountStore";
import type { Auth } from "./auth";

const ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "ada@example.com";
const PHRASE = "first pass phrase";

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
    deleteLogin: () => Promise.resolve(),
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
  return { request, objects, table };
}

function fakeAuth(): Auth {
  let signedIn = false;
  return {
    signUp: vi.fn(() => Promise.resolve()),
    confirm: vi.fn(() => Promise.resolve()),
    resendCode: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => {
      signedIn = true;
      return Promise.resolve();
    }),
    token: () => Promise.resolve(signedIn ? "token" : null),
    email: () => (signedIn ? EMAIL : null),
    signOut: () => {
      signedIn = false;
    },
    forgotPassword: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    changePassword: vi.fn(() => Promise.resolve()),
  };
}

function memoryVault(): KeyVault {
  let key: CryptoKey | null = null;
  return {
    load: () => Promise.resolve(key),
    save: (value) => {
      key = value;
      return Promise.resolve();
    },
    clear: () => {
      key = null;
      return Promise.resolve();
    },
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function setup() {
  const server = backend();
  const auth = fakeAuth();
  const make = () =>
    new AccountStore(auth, memoryVault(), "https://api", server.request, memoryStorage());
  return { ...server, auth, make, store: make() };
}

const CONTENTS = {
  roomId: "room",
  update: new TextEncoder().encode("Secret plan"),
  pictures: [],
  envelope: null,
};

describe("signing in", () => {
  it("creates the account key on first sign-in, with the name chosen at sign-up", async () => {
    const { store } = setup();
    await store.signUp(EMAIL, PHRASE, "Ada");
    await store.signIn(EMAIL, PHRASE);
    expect(store.status).toBe("in");
    expect(store.name).toBe("Ada");
  });

  it("opens the same key from another device with the same password", async () => {
    const { store, make } = setup();
    await store.signUp(EMAIL, PHRASE, "Ada");
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    const other = make();
    await other.signIn(EMAIL, PHRASE);
    expect(other.name).toBe("Ada");
    const { contents } = await other.load(ID);
    expect(new TextDecoder().decode(contents.update)).toBe("Secret plan");
  });

  it("restores from the device, and stays out with no key or session", async () => {
    const server = backend();
    const auth = fakeAuth();
    const vault = memoryVault();
    const first = new AccountStore(auth, vault, "https://api", server.request, memoryStorage());
    await first.signIn(EMAIL, PHRASE);
    const again = new AccountStore(auth, vault, "https://api", server.request, memoryStorage());
    await again.restore();
    expect(again.status).toBe("in");
    await first.signOut();
    const gone = new AccountStore(auth, vault, "https://api", server.request, memoryStorage());
    await gone.restore();
    expect(gone.status).toBe("out");
    expect(gone.name).toBe("");
  });
});

describe("what the server holds", () => {
  it("is only ciphertext, for the bytes and the name", async () => {
    const { store, objects, table } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Quarterly plan", { ...CONTENTS, roomId: "room-identifier" });
    const stored = new TextDecoder("latin1").decode([...objects.values()][0]);
    expect(stored).not.toContain("Secret plan");
    const [record] = await table.workspaces("ada");
    const named = atob(record.sealedName);
    expect(named).not.toContain("Quarterly");
    expect(named).not.toContain("room-identifier");
  });

  it("lists workspaces with their names, opened only here", async () => {
    const { store } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Quarterly plan", CONTENTS);
    expect(await store.workspaces()).toMatchObject([
      { id: ID, name: "Quarterly plan", roomId: "room" },
    ]);
  });
});

describe("passwords", () => {
  it("changing it keeps every workspace readable, under the new one only", async () => {
    const { store, make } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    await store.changePassword(PHRASE, "second pass phrase");
    const fresh = make();
    await fresh.signIn(EMAIL, "second pass phrase");
    expect(fresh.status).toBe("in");
    expect((await fresh.load(ID)).contents.roomId).toBe("room");
    const stale = make();
    await stale.signIn(EMAIL, PHRASE);
    expect(stale.status).toBe("locked");
  });

  it("after a reset, the old password recovers the workspaces and rewraps the key", async () => {
    const { store, make } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    const after = make();
    await after.signIn(EMAIL, "reset pass phrase");
    expect(after.status).toBe("locked");
    await after.unlockWithOldPassword(PHRASE);
    expect(after.status).toBe("in");
    expect((await after.load(ID)).contents.roomId).toBe("room");
    const later = make();
    await later.signIn(EMAIL, "reset pass phrase");
    expect(later.status).toBe("in");
  });

  it("after a reset, a wrong old password changes nothing", async () => {
    const { store, make } = setup();
    await store.signIn(EMAIL, PHRASE);
    const after = make();
    await after.signIn(EMAIL, "reset pass phrase");
    await expect(after.unlockWithOldPassword("wrong")).rejects.toThrow();
    expect(after.status).toBe("locked");
  });

  it("starting over deletes saved workspaces and keeps the name", async () => {
    const { store, make, objects } = setup();
    await store.signUp(EMAIL, PHRASE, "Ada");
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    const after = make();
    await after.signIn(EMAIL, "reset pass phrase");
    await after.startOver();
    expect(after.status).toBe("in");
    expect(after.name).toBe("Ada");
    expect(await after.workspaces()).toEqual([]);
    expect(objects.size).toBe(0);
  });
});

describe("the account", () => {
  it("can be renamed, and that survives signing in again", async () => {
    const { store, make } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.rename("  Ada L  ");
    expect(store.name).toBe("Ada L");
    const other = make();
    await other.signIn(EMAIL, PHRASE);
    expect(other.name).toBe("Ada L");
  });

  it("deleting it removes everything and signs out", async () => {
    const { store, table, objects } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    await store.deleteAccount();
    expect(store.status).toBe("out");
    expect(await table.profile("ada")).toBeNull();
    expect(objects.size).toBe(0);
  });

  it("removes a workspace", async () => {
    const { store } = setup();
    await store.signIn(EMAIL, PHRASE);
    await store.save(ID, "Plan", CONTENTS);
    await store.removeWorkspace(ID);
    expect(await store.workspaces()).toEqual([]);
    await expect(store.load(ID)).rejects.toThrow(/no longer exists/);
  });
});
