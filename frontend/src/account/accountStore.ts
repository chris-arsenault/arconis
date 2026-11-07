import { sha256 } from "../document/pictures";
import type { Auth } from "./auth";
import { encodeSavedCopy, decodeSavedCopy, type SavedCopy } from "./workspaceFile";

/** out: nobody is signed in. in: signed in, with the account's profile. */
export type AccountStatus = "loading" | "out" | "in";

interface Profile {
  name: string;
}
interface WorkspaceRecord {
  id: string;
  name: string;
  roomId: string;
  size: number;
  revision: string;
  updated: number;
}
export type SavedWorkspace = WorkspaceRecord;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** The name an account starts with, from its email, until the person chooses another. */
export function startingName(email: string | null) {
  return (email?.split("@")[0] ?? "").slice(0, 40) || "Me";
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
    const profile = await this.api<Profile>("GET", "me");
    this.name = profile?.name ?? startingName(this.email);
    // The first sign-in creates the profile.
    if (!profile) await this.api("PUT", "me", { name: this.name });
    this.error = "";
    this.set("in");
  }

  private async api<T>(method: string, path: string, body?: object) {
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
    const parsed = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(parsed.error ?? "The request failed.");
    return parsed as T;
  }

  signIn() {
    return this.auth.signIn();
  }

  async rename(name: string) {
    await this.api("PUT", "me", { name });
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
    const reply = await this.api<{ workspaces: WorkspaceRecord[] }>("GET", "workspaces");
    return reply?.workspaces ?? [];
  }

  /** Stores a saved copy under an existing or new identifier. */
  async save(id: string, name: string, copy: SavedCopy) {
    const bytes = encodeSavedCopy(copy);
    const { base64: checksum } = await sha256(bytes);
    const signed = await this.api<{ url: string; revision: string }>("PUT", `workspaces/${id}`, {
      size: bytes.length,
      checksum,
      name,
      roomId: copy.roomId,
    });
    if (!signed) throw new Error("The workspace could not be saved.");
    const uploaded = await this.request(signed.url, {
      method: "PUT",
      body: new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      headers: { "content-type": "application/octet-stream", "x-amz-checksum-sha256": checksum },
    });
    if (!uploaded.ok) throw new Error("The workspace could not be saved.");
    return signed.revision;
  }

  async load(id: string) {
    const record = await this.api<{ url: string; revision: string }>("GET", `workspaces/${id}`);
    if (!record) throw new Error("This workspace no longer exists.");
    const response = await this.request(record.url);
    if (!response.ok) throw new Error("This workspace could not be loaded.");
    const copy = decodeSavedCopy(new Uint8Array(await response.arrayBuffer()));
    return { copy, revision: record.revision };
  }

  async removeWorkspace(id: string) {
    await this.api("DELETE", `workspaces/${id}`);
  }
}
