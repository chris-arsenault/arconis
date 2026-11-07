import { parseEnvelope, type Envelope } from "../collaboration/roomKey";

/**
 * The accounts API behind the ALB, which validates each request's token first. It holds profiles and
 * workspace records, and signs storage links. It never sees a password or a key, and workspace bytes
 * and names reach it only as ciphertext.
 */
export const MAX_NAME_LENGTH = 40;
export const MAX_WORKSPACES = 100;
export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
export const USER_STORAGE_BYTES = 1024 * 1024 * 1024;
export const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;
/** A workspace's encrypted name, which grows a little past what a person would type. */
const MAX_SEALED_NAME = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Profile {
  name: string;
  envelope: Envelope;
  bytes: number;
}
export interface WorkspaceRecord {
  id: string;
  sealedName: string;
  size: number;
  revision: string;
  updated: number;
}

/** What the API needs from DynamoDB. */
export interface AccountTable {
  profile(user: string): Promise<Profile | null>;
  saveProfile(user: string, values: Pick<Profile, "name" | "envelope">): Promise<void>;
  workspaces(user: string): Promise<WorkspaceRecord[]>;
  workspace(user: string, id: string): Promise<WorkspaceRecord | null>;
  saveWorkspace(user: string, record: WorkspaceRecord): Promise<void>;
  deleteWorkspace(user: string, id: string): Promise<void>;
  /** Adds to the user's and the service's stored bytes, or returns false past either limit. */
  addBytes(user: string, delta: number): Promise<boolean>;
  deleteProfile(user: string): Promise<void>;
}

/** What the API needs from S3 and Cognito. */
export interface AccountServices {
  signUpload(user: string, id: string, size: number, checksum: string): Promise<string>;
  signDownload(user: string, id: string): Promise<string>;
  deleteObject(user: string, id: string): Promise<void>;
  deleteLogin(user: string): Promise<void>;
  now(): number;
  newRevision(): string;
}

export interface ApiReply {
  status: number;
  body: object;
}

const reply = (status: number, body: object): ApiReply => ({ status, body });
const notFound = reply(404, { error: "Not found" });
const invalid = (error: string) => reply(400, { error });

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

interface SaveRequest {
  size: number;
  checksum: string;
  sealedName: string;
}

function saveProblem({ size, checksum, sealedName }: Record<string, unknown>) {
  const validSize = Number.isInteger(size) && (size as number) > 0;
  if (!validSize || (size as number) > MAX_WORKSPACE_BYTES)
    return "This workspace is too large to save.";
  if (typeof checksum !== "string" || !checksum) return "A checksum is required.";
  if (typeof sealedName !== "string" || sealedName.length > MAX_SEALED_NAME)
    return "The workspace name is not valid.";
  return "";
}

export class AccountsApi {
  constructor(
    private table: AccountTable,
    private services: AccountServices
  ) {}

  async handle(user: string, method: string, path: string, body: string): Promise<ApiReply> {
    const route = path.split("/").slice(1).join("/");
    if (route === "api/me") return this.me(user, method, parseBody(body));
    if (route === "api/workspaces") return method === "GET" ? this.list(user) : notFound;
    const id = /^api\/workspaces\/([^/]+)$/.exec(route)?.[1] ?? "";
    if (!UUID.test(id)) return notFound;
    return this.workspace(user, method, id, parseBody(body));
  }

  private async me(user: string, method: string, body: Record<string, unknown>) {
    if (method === "GET") {
      const profile = await this.table.profile(user);
      return profile ? reply(200, profile) : notFound;
    }
    if (method === "PUT") return this.saveProfile(user, body);
    if (method === "DELETE") return this.deleteAccount(user);
    return notFound;
  }

  private async saveProfile(user: string, body: Record<string, unknown>) {
    const name = cleanName(body.name);
    const envelope = parseEnvelope(body.envelope);
    if (!name) return invalid(`A name needs 1 to ${MAX_NAME_LENGTH} characters.`);
    if (!envelope) return invalid("The key envelope is not valid.");
    await this.table.saveProfile(user, { name, envelope });
    return reply(200, { name });
  }

  private async deleteAccount(user: string) {
    await this.deleteAllWorkspaces(user);
    await this.table.deleteProfile(user);
    await this.services.deleteLogin(user);
    return reply(200, {});
  }

  private async deleteAllWorkspaces(user: string) {
    const records = await this.table.workspaces(user);
    await Promise.all(records.map((record) => this.remove(user, record)));
  }

  private async list(user: string) {
    return reply(200, { workspaces: await this.table.workspaces(user) });
  }

  private async workspace(user: string, method: string, id: string, body: Record<string, unknown>) {
    if (method === "PUT") return this.prepareSave(user, id, body);
    const record = await this.table.workspace(user, id);
    if (!record) return notFound;
    if (method === "GET")
      return reply(200, { ...record, url: await this.services.signDownload(user, id) });
    if (method !== "DELETE") return notFound;
    await this.remove(user, record);
    return reply(200, {});
  }

  private async remove(user: string, record: WorkspaceRecord) {
    await this.services.deleteObject(user, record.id);
    await this.table.deleteWorkspace(user, record.id);
    await this.table.addBytes(user, -record.size);
  }

  /** Reserves the space, records the workspace and signs a link that allows exactly this upload. */
  private async prepareSave(user: string, id: string, body: Record<string, unknown>) {
    const problem = saveProblem(body);
    if (problem) return invalid(problem);
    const { size: bytes, checksum, sealedName } = body as unknown as SaveRequest;
    const existing = await this.table.workspace(user, id);
    if (!existing && (await this.table.workspaces(user)).length >= MAX_WORKSPACES)
      return reply(409, { error: `An account can hold ${MAX_WORKSPACES} workspaces.` });
    if (!(await this.table.addBytes(user, bytes - (existing?.size ?? 0))))
      return reply(409, { error: "This account's storage is full." });
    const record: WorkspaceRecord = {
      id,
      sealedName,
      size: bytes,
      revision: this.services.newRevision(),
      updated: this.services.now(),
    };
    await this.table.saveWorkspace(user, record);
    const url = await this.services.signUpload(user, id, bytes, checksum);
    return reply(200, { url, revision: record.revision });
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
