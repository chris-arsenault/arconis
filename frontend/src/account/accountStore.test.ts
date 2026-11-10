import { beforeAll, describe, expect, it, vi } from "vitest";
import { AccountsApi, type AccountServices } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";
import { AccountStore, startingName, type Fetcher } from "./accountStore";
import type { Auth } from "./auth";
import { sha256 } from "../document/pictures";
import {
  createEnvelope,
  generateRoomKey,
  seal,
  unseal,
  openEnvelope,
  defaultRoomKey,
  DEFAULT_PASSWORD,
} from "../collaboration/roomKey";
import { encodeContents, decodeContents, type SavedCopy } from "./workspaceFile";

const ID = "11111111-1111-4111-8111-111111111111";
const ROOM = "ab".repeat(24);
const EMAIL = "ada@example.com";

/** The real API over an in-memory table and bucket, reached through the store's own fetch calls. */
function backend() {
  const table = memoryAccountTable();
  const objects = new Map<string, Uint8Array>();
  const services = {
    objectInfo: async (user, id) => {
      const bytes = objects.get(`https://s3/${user}/${id}`);
      return bytes ? { size: bytes.length, checksum: (await sha256(bytes)).base64 } : null;
    },
    signUpload: (user, id) => Promise.resolve(`https://s3/${user}/${id}`),
    signDownload: (user, id) => Promise.resolve(`https://s3/${user}/${id}`),
    deleteObject: (user, id) => {
      objects.delete(`https://s3/${user}/${id}`);
      return Promise.resolve();
    },
    deleteLogin: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    newRevision: () => crypto.randomUUID(),
  } satisfies AccountServices;
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
    const reply = await api.handle(
      "ada",
      init?.method ?? "GET",
      path,
      typeof init?.body === "string" ? init.body : ""
    );
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return { request, objects, table, services };
}

/** Sign-in as the browser sees it: a session that exists or does not. */
function fakeAuth(signedIn = true) {
  const session = { signedIn, failure: "" };
  const auth = {
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
  return { auth: auth satisfies Auth, session };
}

function setup(signedIn = true) {
  const server = backend();
  const { auth, session } = fakeAuth(signedIn);
  const make = () => new AccountStore(auth, "https://api", server.request);
  return { ...server, auth, session, make, store: make() };
}

const CONTENTS = { roomId: ROOM, update: new TextEncoder().encode("Quarterly plan"), pictures: [] };
let COPY: SavedCopy;
beforeAll(async () => {
  const key = await defaultRoomKey(ROOM);
  COPY = {
    roomId: ROOM,
    envelope: await createEnvelope(DEFAULT_PASSWORD, key, 1),
    sealed: await seal(key, encodeContents(CONTENTS)),
  };
});

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
  it("stores a nopass room sealed and lists it by its title and room", async () => {
    const { store, objects } = setup();
    await store.restore();
    await store.save(ID, "Quarterly plan", COPY, "");
    expect(await store.workspaces()).toMatchObject([
      { id: ID, name: "Quarterly plan", roomId: ROOM },
    ]);
    const { copy } = await store.load(ID);
    const key = await openEnvelope(DEFAULT_PASSWORD, copy.envelope);
    expect(new TextDecoder().decode(decodeContents(await unseal(key, copy.sealed)).update)).toBe(
      "Quarterly plan"
    );
    expect(objects.size).toBe(1);
  });

  it("removes a workspace", async () => {
    const { store } = setup();
    await store.restore();
    await store.save(ID, "Plan", COPY, "");
    await store.removeWorkspace(ID);
    expect(await store.workspaces()).toEqual([]);
    await expect(store.load(ID)).rejects.toThrow(/no longer exists/);
  });

  it("returns the saved revision through listing and loading, and changes it on replacement", async () => {
    const { store } = setup();
    await store.restore();
    const first = await store.save(ID, "First", COPY, "");
    expect((await store.load(ID)).revision).toBe(first);
    expect(await store.workspaces()).toMatchObject([{ id: ID, revision: first, updated: 1000 }]);
    const second = await store.save(ID, "Second", COPY, first);
    expect(second).not.toBe(first);
    expect((await store.load(ID)).revision).toBe(second);
    expect(await store.workspaces()).toMatchObject([{ id: ID, name: "Second", revision: second }]);
  });

  it("preserves validation and storage refusal messages from the real API", async () => {
    const { store, table, objects } = setup();
    await store.restore();
    await expect(store.rename(" ")).rejects.toThrow("A name needs 1 to 40 characters.");
    expect(store.name).toBe("ada");
    await expect(store.save(ID, "x".repeat(201), COPY, "")).rejects.toThrow(
      "The workspace name is not valid."
    );
    table.setBytes("ada", 1024 ** 3);
    await expect(store.save(ID, "Refused", COPY, "")).rejects.toThrow(
      "This account's storage is full."
    );
    expect(objects.size).toBe(0);
    expect(await store.workspaces()).toEqual([]);
  });

  it("sends only metadata to the accounts API while saving and loading opaque password contents", async () => {
    const { auth, request } = setup();
    const calls = vi.fn(request);
    const store = new AccountStore(auth, "https://api", calls);
    const roomId = `locked-${ROOM}`;
    const key = await generateRoomKey();
    const copy: SavedCopy = {
      roomId,
      envelope: await createEnvelope("room password", key, 1),
      sealed: await seal(key, encodeContents({ ...CONTENTS, roomId })),
    };
    await store.restore();
    await store.save(ID, "Password room", copy, "");
    expect((await store.load(ID)).copy).toEqual(copy);
    const apiSave = calls.mock.calls.find(
      ([url, init]) => url === `https://api/api/workspaces/${ID}` && init?.method === "PUT"
    );
    expect(
      Object.keys(JSON.parse(apiSave?.[1]?.body as string) as Record<string, unknown>).sort(
        (a, b) => a.localeCompare(b)
      )
    ).toEqual(["checksum", "expectedRevision", "name", "roomId", "size"]);
  });
});

it("rejects malformed successful metadata rather than asserting an arbitrary reply type", async () => {
  const { auth } = fakeAuth();
  const store = new AccountStore(auth, "https://api", () =>
    Promise.resolve(
      Response.json({ workspaces: [{ id: ID, revision: "missing the other fields" }] })
    )
  );
  await expect(store.workspaces()).rejects.toThrow(
    "The account service returned an invalid reply."
  );
  await expect(store.load(ID)).rejects.toThrow("The account service returned an invalid reply.");
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
    await store.save(ID, "Plan", COPY, "");
    await store.deleteAccount();
    expect(store.status).toBe("out");
    expect(await table.profile("ada")).toBeNull();
    expect(objects.size).toBe(0);
    expect(services.deleteLogin).toHaveBeenCalledWith("ada");
  });

  it("resumes unfinished deletion after reloading with the same authenticated account", async () => {
    const { store, make, services, auth, table } = setup();
    await store.restore();
    services.deleteLogin = vi
      .fn()
      .mockRejectedValueOnce(new Error("Sign-in removal unavailable"))
      .mockResolvedValue(undefined);
    await expect(store.deleteAccount()).rejects.toThrow("Sign-in removal unavailable");
    expect(store.status).toBe("deleting");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(await table.isDeleting("ada")).toBe(true);

    const reloaded = make();
    await reloaded.restore();
    expect(reloaded.status).toBe("deleting");
    expect(reloaded.email).toBe(EMAIL);
    expect(reloaded.error).toBe("This account is being deleted.");
    await reloaded.deleteAccount();
    expect(reloaded.status).toBe("out");
    expect(reloaded.error).toBe("");
    expect(services.deleteLogin).toHaveBeenCalledTimes(2);
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("leaves account controls in deletion state when another browser began deleting", async () => {
    const { store, table } = setup();
    await store.restore();
    const changed = vi.fn();
    store.subscribe(changed);
    await table.beginDelete("ada");
    await expect(store.workspaces()).rejects.toThrow("This account is being deleted.");
    expect(store.status).toBe("deleting");
    expect(store.email).toBe(EMAIL);
    await expect(store.workspaces()).rejects.toThrow("This account is being deleted.");
    expect(changed).toHaveBeenCalledOnce();
    await store.signOut();
    expect(store.status).toBe("out");
    expect(store.error).toBe("");
  });
});
