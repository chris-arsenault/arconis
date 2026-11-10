import { sha256 } from "../document/pictures";
import type { Auth } from "./auth";
import { libraryListSchema, type LibrarySave } from "../protocol/library";
import { encodeSavedCopy, decodeSavedCopy, type SavedCopy } from "./workspaceFile";
import type {
  AccountProfile,
  AccountRequestBody,
  SaveWorkspaceRequest,
  PublishWorkspaceRequest,
  UpdateProfileRequest,
  WorkspaceDownloadReply,
  WorkspaceListReply,
  WorkspaceRecord,
  WorkspaceUploadReply,
} from "../protocol/account";

/** out: nobody is signed in. in: signed in, with the account's profile. */
export type AccountStatus = "loading" | "out" | "in";

export type SavedWorkspace = WorkspaceRecord;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class WorkspaceConflict extends Error {}

function accountFailure(value: unknown) {
  if (!isRecord(value) || typeof value.error !== "string") return new Error("The request failed.");
  return value.code === "workspace_conflict"
    ? new WorkspaceConflict(value.error)
    : new Error(value.error);
}

/** The name an account starts with, from its email, until the person chooses another. */
export function startingName(email: string | null) {
  return (email?.split("@")[0] ?? "").slice(0, 40) || "Me";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function malformedReply(): never {
  throw new Error("The account service returned an invalid reply.");
}

/** The browser needs only the profile name, an explicit projection of the HTTP reply. */
function profileName(value: unknown): Pick<AccountProfile, "name"> {
  if (!isRecord(value) || typeof value.name !== "string") return malformedReply();
  return { name: value.name };
}
function textField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : malformedReply();
}
function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : malformedReply();
}
function workspaceRecord(value: unknown): WorkspaceRecord {
  if (!isRecord(value)) return malformedReply();
  return {
    id: textField(value, "id"),
    name: textField(value, "name"),
    roomId: textField(value, "roomId"),
    revision: textField(value, "revision"),
    size: numberField(value, "size"),
    updated: numberField(value, "updated"),
  };
}
function workspaceList(value: unknown): WorkspaceListReply {
  if (!isRecord(value) || !Array.isArray(value.workspaces)) return malformedReply();
  return { workspaces: value.workspaces.map(workspaceRecord) };
}
/** Download metadata has more fields, but loading uses the same signed-link projection. */
function workspaceLink(
  value: unknown
): WorkspaceUploadReply & Pick<WorkspaceDownloadReply, "url" | "revision"> {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.revision !== "string")
    return malformedReply();
  return { url: value.url, revision: value.revision };
}

export class AccountStore {
  status: AccountStatus = "loading";
  name = "";
  email = "";
  /** Why the last sign-in did not finish, for the account panel. */
  error = "";
  private listeners = new Set<() => void>();
  version = 0;

  constructor(
    private auth: Auth,
    private apiUrl: string,
    private request: Fetcher = (url, init) => fetch(url, init)
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  private set(status: AccountStatus) {
    this.status = status;
    this.changed();
  }

  /** Finishes a sign-in the browser has come back from, or picks up an earlier one. */
  async restore() {
    try {
      await this.auth.completeSignIn();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Signing in did not finish.";
    }
    if (!(await this.auth.token())) {
      this.set("out");
      return;
    }
    this.email = (await this.auth.email()) ?? "";
    const reply = await this.api("GET", "me");
    const profile = reply === null ? null : profileName(reply);
    this.name = profile?.name ?? startingName(this.email);
    // The first sign-in creates the profile.
    if (!profile) await this.api("PUT", "me", { name: this.name } satisfies UpdateProfileRequest);
    this.error = "";
    this.set("in");
  }

  private async api(
    method: "GET" | "PUT" | "POST" | "DELETE",
    path: string,
    body?: AccountRequestBody
  ) {
    const token = await this.auth.token();
    if (!token) throw new Error("Sign in again.");
    const response = await this.request(`${this.apiUrl}/api/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404) return null;
    const parsed: unknown = await response.json();
    if (!response.ok) throw accountFailure(parsed);
    return parsed;
  }

  signIn() {
    return this.auth.signIn();
  }

  async layouts() {
    return libraryListSchema.parse(await this.api("GET", "library")).entries;
  }

  async saveLayout(name: string, source: string) {
    const bytes = new TextEncoder().encode(source);
    const { base64: checksum } = await sha256(bytes);
    const values: LibrarySave = { name, size: bytes.length, checksum };
    const id = crypto.randomUUID();
    const signed = workspaceLink(await this.api("PUT", `library/${id}`, values));
    const uploaded = await this.request(signed.url, {
      method: "PUT",
      body: new Blob([bytes]),
      headers: { "content-type": "application/octet-stream", "x-amz-checksum-sha256": checksum },
    });
    if (!uploaded.ok) throw new Error("The layout could not be saved.");
    await this.api("POST", `library/${id}`, { ...values, revision: signed.revision });
    this.changed();
  }

  async loadLayout(id: string) {
    const signed = workspaceLink(await this.api("GET", `library/${id}`));
    const response = await this.request(signed.url);
    if (!response.ok) throw new Error("The layout could not be opened.");
    return response.text();
  }

  async renameLayout(id: string, name: string) {
    await this.api("PUT", `library/${id}/name`, { name });
    this.changed();
  }

  async removeLayout(id: string) {
    await this.api("DELETE", `library/${id}`);
    this.changed();
  }

  async rename(name: string) {
    await this.api("PUT", "me", { name } satisfies UpdateProfileRequest);
    this.name = name.trim();
    this.changed();
  }

  async signOut() {
    this.name = "";
    this.email = "";
    this.set("out");
    await this.auth.signOut();
  }

  /** Removes the account, its sign-in and everything saved in it. */
  async deleteAccount() {
    await this.api("DELETE", "me");
    await this.signOut();
  }

  async workspaces(): Promise<SavedWorkspace[]> {
    const reply = await this.api("GET", "workspaces");
    return reply === null ? [] : workspaceList(reply).workspaces;
  }

  /** Stores a saved copy under an existing or new identifier. */
  async save(id: string, name: string, copy: SavedCopy, expectedRevision: string) {
    const bytes = encodeSavedCopy(copy);
    const { base64: checksum } = await sha256(bytes);
    const metadata = {
      size: bytes.length,
      checksum,
      name,
      roomId: copy.roomId,
      expectedRevision,
    } satisfies SaveWorkspaceRequest;
    const reply = await this.api("PUT", `workspaces/${id}`, metadata);
    if (reply === null) throw new Error("The workspace could not be saved.");
    const signed = workspaceLink(reply);
    const uploaded = await this.request(signed.url, {
      method: "PUT",
      body: new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      headers: { "content-type": "application/octet-stream", "x-amz-checksum-sha256": checksum },
    });
    if (!uploaded.ok) throw new Error("The workspace could not be saved.");
    await this.api("POST", `workspaces/${id}`, {
      ...metadata,
      revision: signed.revision,
    } satisfies PublishWorkspaceRequest);
    this.changed();
    return signed.revision;
  }

  async load(id: string) {
    return this.loadWorkspace(`workspaces/${id}`);
  }

  async history(id: string) {
    return workspaceList(await this.api("GET", `workspaces/${id}/history`)).workspaces;
  }

  async loadRevision(id: string, revision: string) {
    return this.loadWorkspace(`workspaces/${id}/revisions/${revision}`);
  }

  private async loadWorkspace(path: string) {
    const reply = await this.api("GET", path);
    if (reply === null) throw new Error("This workspace no longer exists.");
    const record = workspaceLink(reply);
    const response = await this.request(record.url);
    if (!response.ok) throw new Error("This workspace could not be loaded.");
    const copy = decodeSavedCopy(new Uint8Array(await response.arrayBuffer()));
    return { copy, revision: record.revision };
  }

  async removeWorkspace(id: string) {
    await this.api("DELETE", `workspaces/${id}`);
    this.changed();
  }
}
