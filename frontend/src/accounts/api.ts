/**
 * The accounts API behind the ALB, which validates each request's token first. It holds profiles and
 * workspace records, and signs storage links. A password room's saved copy reaches it encrypted under
 * that room's key; it never sees a password or a key.
 */
import type {
  AccountFailure,
  AccountProfile,
  AccountReply,
  SaveWorkspaceRequest,
  WorkspaceRecord,
} from "../protocol/account";

export const MAX_NAME_LENGTH = 40;
export const MAX_WORKSPACES = 100;
export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
export const USER_STORAGE_BYTES = 1024 * 1024 * 1024;
export const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;
/** A workspace's name is its room's title, which a person may write at length. */
const MAX_WORKSPACE_NAME = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Ordinary, password and device-only rooms: `locked-` and `local-` mark the last two. */
const ROOM_ID = /^(locked-|local-)?[a-f0-9]{48}$/;

/** What the API needs from DynamoDB. */
export interface AccountTable {
  profile(user: string): Promise<AccountProfile | null>;
  saveProfile(user: string, values: Pick<AccountProfile, "name">): Promise<void>;
  workspaces(user: string): Promise<WorkspaceRecord[]>;
  workspace(user: string, id: string): Promise<WorkspaceRecord | null>;
  saveWorkspace(user: string, record: WorkspaceRecord): Promise<void>;
  deleteWorkspace(user: string, id: string): Promise<void>;
  /** Adds to the user's and the service's stored bytes, or returns false past either limit. */
  addBytes(user: string, delta: number): Promise<boolean>;
  deleteProfile(user: string): Promise<void>;
}

/** What the API needs from S3, Cognito and Auth0. */
export interface AccountServices {
  signUpload(user: string, id: string, size: number, checksum: string): Promise<string>;
  signDownload(user: string, id: string): Promise<string>;
  deleteObject(user: string, id: string): Promise<void>;
  /** Removes the person's sign-in everywhere it exists: Auth0's user and its pool user. */
  deleteLogin(user: string): Promise<void>;
  now(): number;
  newRevision(): string;
}

const notFound: AccountFailure = { status: 404, body: { error: "Not found" } };
const invalid = (error: string): AccountFailure => ({ status: 400, body: { error } });
const conflict = (error: string): AccountFailure => ({ status: 409, body: { error } });

function parseBody(body: string) {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

function saveProblem({ size, checksum, name, roomId }: Record<string, unknown>) {
  const validSize = Number.isInteger(size) && (size as number) > 0;
  if (!validSize || (size as number) > MAX_WORKSPACE_BYTES)
    return "This workspace is too large to save.";
  if (typeof checksum !== "string" || !checksum) return "A checksum is required.";
  if (typeof name !== "string" || name.length > MAX_WORKSPACE_NAME)
    return "The workspace name is not valid.";
  if (typeof roomId !== "string" || !ROOM_ID.test(roomId)) return "The room is not valid.";
  return "";
}

export class AccountsApi {
  constructor(
    private table: AccountTable,
    private services: AccountServices
  ) {}

  async handle(user: string, method: string, path: string, body: string): Promise<AccountReply> {
    const route = path.split("/").slice(1).join("/");
    if (route === "api/me") return this.me(user, method, parseBody(body));
    if (route === "api/workspaces") return method === "GET" ? this.list(user) : notFound;
    const id = /^api\/workspaces\/([^/]+)$/.exec(route)?.[1] ?? "";
    if (!UUID.test(id)) return notFound;
    return this.workspace(user, method, id, parseBody(body));
  }

  private async me(user: string, method: string, body: Record<string, unknown>) {
    if (method === "GET") {
      return this.profile(user);
    }
    if (method === "PUT") return this.saveProfile(user, body);
    if (method === "DELETE") return this.deleteAccount(user);
    return notFound;
  }

  private async profile(user: string): Promise<AccountReply<"getProfile">> {
    const profile = await this.table.profile(user);
    return profile ? { status: 200, body: profile } : notFound;
  }

  private async saveProfile(
    user: string,
    body: Record<string, unknown>
  ): Promise<AccountReply<"updateProfile">> {
    const name = cleanName(body.name);
    if (!name) return invalid(`A name needs 1 to ${MAX_NAME_LENGTH} characters.`);
    await this.table.saveProfile(user, { name });
    return { status: 200, body: { name } };
  }

  private async deleteAccount(user: string): Promise<AccountReply<"deleteAccount">> {
    await this.deleteAllWorkspaces(user);
    await this.table.deleteProfile(user);
    await this.services.deleteLogin(user);
    return { status: 200, body: {} };
  }

  private async deleteAllWorkspaces(user: string) {
    const records = await this.table.workspaces(user);
    await Promise.all(records.map((record) => this.remove(user, record)));
  }

  private async list(user: string): Promise<AccountReply<"listWorkspaces">> {
    return { status: 200, body: { workspaces: await this.table.workspaces(user) } };
  }

  private async workspace(user: string, method: string, id: string, body: Record<string, unknown>) {
    if (method === "PUT") return this.prepareSave(user, id, body);
    const record = await this.table.workspace(user, id);
    if (!record) return notFound;
    if (method === "GET") return this.download(user, record);
    if (method !== "DELETE") return notFound;
    return this.deleteWorkspace(user, record);
  }

  private async download(
    user: string,
    record: WorkspaceRecord
  ): Promise<AccountReply<"getWorkspace">> {
    return {
      status: 200,
      body: { ...record, url: await this.services.signDownload(user, record.id) },
    };
  }

  private async deleteWorkspace(
    user: string,
    record: WorkspaceRecord
  ): Promise<AccountReply<"deleteWorkspace">> {
    await this.remove(user, record);
    return { status: 200, body: {} };
  }

  private async remove(user: string, record: WorkspaceRecord) {
    await this.services.deleteObject(user, record.id);
    await this.table.deleteWorkspace(user, record.id);
    await this.table.addBytes(user, -record.size);
  }

  /** Reserves the space, records the workspace and signs a link that allows exactly this upload. */
  private async prepareSave(
    user: string,
    id: string,
    body: Record<string, unknown>
  ): Promise<AccountReply<"saveWorkspace">> {
    const problem = saveProblem(body);
    if (problem) return invalid(problem);
    // Only the validated HTTP boundary narrows untrusted JSON to the shared request contract.
    const { size: bytes, checksum, name, roomId } = body as unknown as SaveWorkspaceRequest;
    const existing = await this.table.workspace(user, id);
    if (!existing && (await this.table.workspaces(user)).length >= MAX_WORKSPACES)
      return conflict(`An account can hold ${MAX_WORKSPACES} workspaces.`);
    if (!(await this.table.addBytes(user, bytes - (existing?.size ?? 0))))
      return conflict("This account's storage is full.");
    const record: WorkspaceRecord = {
      id,
      name: name.trim(),
      roomId,
      size: bytes,
      revision: this.services.newRevision(),
      updated: this.services.now(),
    };
    await this.table.saveWorkspace(user, record);
    const url = await this.services.signUpload(user, id, bytes, checksum);
    return { status: 200, body: { url, revision: record.revision } };
  }
}

/** The token's subject. The ALB has already validated the token, so this only reads it. */
export function tokenSubject(authorization: string | undefined) {
  const payload = authorization?.replace(/^Bearer /i, "").split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown };
    return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}
