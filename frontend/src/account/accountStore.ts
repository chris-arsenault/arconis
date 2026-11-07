import { sha256 } from "../document/pictures";
import type { Envelope } from "../collaboration/roomKey";
import {
  WrongPassword,
  createEnvelope,
  generateRoomKey,
  openEnvelope,
} from "../collaboration/roomKey";
import type { Auth } from "./auth";
import {
  openContents,
  openLabel,
  sealContents,
  sealLabel,
  type WorkspaceContents,
} from "./workspaceFile";

/**
 * out: nobody is signed in. in: signed in, with the account key available. locked: signed in after a
 * password reset, so the old password is needed to open the key.
 */
export type AccountStatus = "loading" | "out" | "in" | "locked";

interface Profile {
  name: string;
  envelope: Envelope;
}
interface WorkspaceRecord {
  id: string;
  sealedName: string;
  size: number;
  revision: string;
  updated: number;
}
export interface SavedWorkspace {
  id: string;
  name: string;
  roomId: string;
  size: number;
  updated: number;
  revision: string;
}

/** Keeps the key on this device between visits, in a form scripts cannot extract as bytes alone. */
export interface KeyVault {
  load(): Promise<CryptoKey | null>;
  save(key: CryptoKey): Promise<void>;
  clear(): Promise<void>;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** What the name was going to be while the account is not yet activated. */
const PENDING_NAME = "arconis:pending-name";

export class AccountStore {
  status: AccountStatus = "loading";
  name = "";
  private key: CryptoKey | null = null;
  private envelope: Envelope | null = null;
  /** The password just used to sign in, kept only while waiting for the old one after a reset. */
  private currentPassword = "";
  private listeners = new Set<() => void>();
  version = 0;

  constructor(
    private auth: Auth,
    private vault: KeyVault,
    private apiUrl: string,
    private request: Fetcher = (url, init) => fetch(url, init),
    private storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage
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

  get email() {
    return this.auth.email();
  }

  /** Picks up an earlier sign-in on this device. */
  async restore() {
    const key = await this.vault.load();
    const token = await this.auth.token();
    if (!key || !token) {
      this.set("out");
      return;
    }
    const profile = await this.profile();
    if (!profile) {
      this.set("out");
      return;
    }
    this.key = key;
    this.useProfile(profile);
    this.set("in");
  }

  private useProfile(profile: Profile) {
    this.name = profile.name;
    this.envelope = profile.envelope;
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

  private profile() {
    return this.api<Profile>("GET", "me");
  }

  async signUp(email: string, password: string, name: string) {
    await this.auth.signUp(email, password);
    this.storage.setItem(PENDING_NAME, name);
  }
  confirm(email: string, code: string) {
    return this.auth.confirm(email, code);
  }
  resendCode(email: string) {
    return this.auth.resendCode(email);
  }
  forgotPassword(email: string) {
    return this.auth.forgotPassword(email);
  }
  resetPassword(email: string, code: string, password: string) {
    return this.auth.resetPassword(email, code, password);
  }

  /**
   * Signs in, then opens the account key with the same password. It happens here because this is the
   * one moment the browser holds the password, and the first sign-in is when the key is created.
   */
  async signIn(email: string, password: string) {
    await this.auth.signIn(email, password);
    const profile = await this.profile();
    if (!profile) {
      await this.createKey(password, this.storage.getItem(PENDING_NAME) ?? email.split("@")[0]);
      this.storage.removeItem(PENDING_NAME);
      return;
    }
    this.useProfile(profile);
    try {
      await this.unlockWith(password);
    } catch (error) {
      if (!(error instanceof WrongPassword)) throw error;
      this.currentPassword = password;
      this.set("locked");
    }
  }

  private async createKey(password: string, name: string) {
    const key = await generateRoomKey();
    const envelope = await createEnvelope(password, key, 1);
    await this.api("PUT", "me", { name, envelope });
    await this.adopt(key, { name, envelope });
  }

  private async adopt(key: CryptoKey, profile: Profile) {
    this.key = key;
    this.useProfile(profile);
    await this.vault.save(key);
    this.currentPassword = "";
    this.set("in");
  }

  private async unlockWith(password: string) {
    const key = await openEnvelope(password, this.envelope!);
    await this.adopt(key, { name: this.name, envelope: this.envelope! });
  }

  /** After a password reset: opens the key with the old password, and rewraps it for the new one. */
  async unlockWithOldPassword(old: string) {
    const key = await openEnvelope(old, this.envelope!);
    const envelope = await createEnvelope(this.currentPassword, key, this.envelope!.revision + 1);
    await this.api("PUT", "me", { name: this.name, envelope });
    await this.adopt(key, { name: this.name, envelope });
  }

  /** After a password reset with the old one forgotten: saved workspaces are unrecoverable. */
  async startOver() {
    const records = (await this.api<{ workspaces: WorkspaceRecord[] }>("GET", "workspaces"))
      ?.workspaces;
    await Promise.all((records ?? []).map(({ id }) => this.api("DELETE", `workspaces/${id}`)));
    await this.createKey(this.currentPassword, this.name);
  }

  /** Changes the password, rewrapping the same key so every workspace stays readable. */
  async changePassword(current: string, next: string) {
    await this.auth.changePassword(current, next);
    const key = this.requireKey();
    const envelope = await createEnvelope(next, key, this.envelope!.revision + 1);
    await this.api("PUT", "me", { name: this.name, envelope });
    await this.adopt(key, { name: this.name, envelope });
  }

  async rename(name: string) {
    await this.api("PUT", "me", { name, envelope: this.envelope });
    this.name = name.trim();
    this.changed();
  }

  async signOut() {
    this.auth.signOut();
    await this.vault.clear();
    this.key = null;
    this.envelope = null;
    this.name = "";
    this.set("out");
  }

  /** Removes the account and everything saved in it. */
  async deleteAccount() {
    await this.api("DELETE", "me");
    await this.signOut();
  }

  private requireKey() {
    if (!this.key) throw new Error("Sign in again.");
    return this.key;
  }

  async workspaces(): Promise<SavedWorkspace[]> {
    const key = this.requireKey();
    const reply = await this.api<{ workspaces: WorkspaceRecord[] }>("GET", "workspaces");
    const labelled = await Promise.all(
      (reply?.workspaces ?? []).map(async (record) => {
        const label = await openLabel(key, record.sealedName);
        return label && { ...record, ...label };
      })
    );
    return labelled.filter((workspace) => workspace !== null);
  }

  /** Encrypts and stores a workspace under an existing or new identifier. */
  async save(id: string, name: string, contents: WorkspaceContents) {
    const key = this.requireKey();
    const sealed = await sealContents(key, contents);
    const { base64: checksum } = await sha256(sealed);
    const sealedName = await sealLabel(key, { name, roomId: contents.roomId });
    const signed = await this.api<{ url: string; revision: string }>("PUT", `workspaces/${id}`, {
      size: sealed.length,
      checksum,
      sealedName,
    });
    if (!signed) throw new Error("The workspace could not be saved.");
    const uploaded = await this.request(signed.url, {
      method: "PUT",
      body: new Blob([new Uint8Array(sealed)], { type: "application/octet-stream" }),
      headers: { "content-type": "application/octet-stream", "x-amz-checksum-sha256": checksum },
    });
    if (!uploaded.ok) throw new Error("The workspace could not be saved.");
    return signed.revision;
  }

  async load(id: string) {
    const key = this.requireKey();
    const record = await this.api<{ url: string; revision: string }>("GET", `workspaces/${id}`);
    if (!record) throw new Error("This workspace no longer exists.");
    const response = await this.request(record.url);
    if (!response.ok) throw new Error("This workspace could not be loaded.");
    const contents = await openContents(key, new Uint8Array(await response.arrayBuffer()));
    return { contents, revision: record.revision };
  }

  async removeWorkspace(id: string) {
    await this.api("DELETE", `workspaces/${id}`);
  }
}

/** The account key in this browser, kept as a key object rather than bytes in ordinary storage. */
export function indexedDbKeyVault(): KeyVault {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("arconis-account", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("keys");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("This browser could not open its key storage."));
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest
  ) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const request = action(db.transaction("keys", mode).objectStore("keys"));
      request.onsuccess = () => {
        db.close();
        resolve(request.result as T);
      };
      request.onerror = () => reject(new Error("This browser could not use its key storage."));
    });
  };
  return {
    load: async () =>
      (await run<CryptoKey | undefined>("readonly", (s) => s.get("account"))) ?? null,
    save: async (key) => {
      await run<unknown>("readwrite", (s) => s.put(key, "account"));
    },
    clear: async () => {
      await run<unknown>("readwrite", (s) => s.delete("account"));
    },
  };
}
