/**
 * The accounts API behind the ALB, which validates each request's token first. It holds profiles and
 * workspace records, and signs storage links. Saved room copies arrive sealed under their room key.
 */
import type { AccountFailure, AccountProfile, AccountReply } from "../protocol/account";
import { LibraryApi, type LibraryTable } from "./library";
import type { LibraryReply } from "../protocol/library";
import { WorkspacesApi, type WorkspaceTable } from "./workspaces";

export const MAX_NAME_LENGTH = 40;
export const MAX_WORKSPACES = 100;
export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
export const USER_STORAGE_BYTES = 1024 * 1024 * 1024;
export const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;

/** What the API needs from DynamoDB. */
export interface AccountTable extends LibraryTable, WorkspaceTable {
  profile(user: string): Promise<AccountProfile | null>;
  saveProfile(user: string, values: Pick<AccountProfile, "name">): Promise<boolean>;
  beginDelete(user: string): Promise<void>;
  isDeleting(user: string): Promise<boolean>;
  deleteProfile(user: string): Promise<void>;
}

/** What the API needs from S3 and Auth0. */
export interface AccountServices {
  objectInfo(user: string, id: string): Promise<{ size: number; checksum: string } | null>;
  signUpload(user: string, id: string, size: number, checksum: string): Promise<string>;
  signDownload(user: string, id: string): Promise<string>;
  deleteObject(user: string, id: string): Promise<void>;
  /** Removes the person's Auth0 sign-in. */
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

export class AccountsApi {
  readonly library: LibraryApi;
  readonly workspaces: WorkspacesApi;
  constructor(
    private table: AccountTable,
    private services: AccountServices
  ) {
    this.library = new LibraryApi(table, services);
    this.workspaces = new WorkspacesApi(table, services);
  }

  async handle(
    user: string,
    method: string,
    path: string,
    body: string
  ): Promise<AccountReply | LibraryReply> {
    const route = path.split("/").slice(1).join("/");
    if (!(route === "api/me" && method === "DELETE") && (await this.table.isDeleting(user)))
      return {
        status: 409,
        body: { error: "This account is being deleted.", code: "account_deleting" },
      };
    if (/^api\/library(?:\/|$)/.test(route))
      return this.library.handle(user, method, route, parseBody(body));
    if (route === "api/me") return this.me(user, method, parseBody(body));
    if (/^api\/workspaces(?:\/|$)/.test(route))
      return this.workspaces.handle(user, method, route, parseBody(body));
    return notFound;
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
    if (!(await this.table.saveProfile(user, { name })))
      return {
        status: 409,
        body: { error: "This account is being deleted.", code: "account_deleting" },
      };
    return { status: 200, body: { name } };
  }

  private async deleteAccount(user: string): Promise<AccountReply<"deleteAccount">> {
    await this.table.beginDelete(user);
    await this.library.deleteAll(user);
    const workspaceProblem = await this.workspaces.deleteAll(user);
    if (workspaceProblem) return conflict(workspaceProblem);
    await this.table.deleteProfile(user);
    await this.services.deleteLogin(user);
    return { status: 200, body: {} };
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
