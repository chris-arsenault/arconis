import type {
  AccountProfile,
  AccountFailure,
  AccountReply,
  SaveWorkspaceRequest,
  WorkspaceRecord,
} from "../protocol/account";
import type { AccountServices } from "./api";
import { MAX_WORKSPACES, MAX_WORKSPACE_BYTES, USER_STORAGE_BYTES } from "./api";

export interface WorkspaceTable {
  workspaces(user: string): Promise<WorkspaceRecord[]>;
  workspace(user: string, id: string): Promise<WorkspaceRecord | null>;
  workspaceHistory(user: string, id: string): Promise<WorkspaceRecord[]>;
  commitWorkspace(
    user: string,
    record: WorkspaceRecord,
    expected: string,
    pruned: WorkspaceRecord[]
  ): Promise<"saved" | "conflict" | "full">;
  deleteWorkspace(user: string, record: WorkspaceRecord): Promise<boolean>;
}
export const snapshotObject = (record: Pick<WorkspaceRecord, "id" | "revision">) =>
  `snapshots/${record.id}/${record.revision}`;
const absent: AccountReply = { status: 404, body: { error: "Not found" } };
const conflict = (): AccountFailure => ({
  status: 409,
  body: {
    error: "The workspace changed. Merge its latest saved copy and try again.",
    code: "workspace_conflict",
  },
});
const invalid = (error: string): AccountFailure => ({ status: 400, body: { error } });

const validSize = (size: unknown) =>
  Number.isInteger(size) && Number(size) > 0 && Number(size) <= MAX_WORKSPACE_BYTES;

function problem(body: Record<string, unknown>) {
  if (!validSize(body.size)) return "This workspace is too large to save.";
  if (typeof body.name !== "string" || body.name.length > 200)
    return "The workspace name is not valid.";
  if (typeof body.roomId !== "string" || !/^(locked-|local-)?[a-f0-9]{48}$/.test(body.roomId))
    return "The room is not valid.";
  if (typeof body.checksum !== "string" || !body.checksum) return "A checksum is required.";
  if (typeof body.expectedRevision !== "string") return "The previous saved revision is required.";
  return "";
}

export class WorkspacesApi {
  constructor(
    private table: WorkspaceTable & { profile(user: string): Promise<AccountProfile | null> },
    private services: AccountServices
  ) {}

  async handle(
    user: string,
    method: string,
    route: string,
    body: Record<string, unknown>
  ): Promise<AccountReply> {
    if (route === "api/workspaces")
      return method === "GET"
        ? { status: 200, body: { workspaces: await this.table.workspaces(user) } }
        : absent;
    const match =
      /^api\/workspaces\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(history|revisions)(?:\/([A-Za-z0-9_-]+))?)?$/.exec(
        route
      );
    if (!match) return absent;
    const [, id, part, revision] = match;
    if (part) return method === "GET" ? this.history(user, id, part, revision) : absent;
    if (method === "PUT") return this.prepare(user, id, body);
    if (method === "POST") return this.publish(user, id, body);
    return this.current(user, id, method);
  }

  private async history(
    user: string,
    id: string,
    part: string,
    revision: string | undefined
  ): Promise<AccountReply> {
    if (!(await this.table.workspace(user, id))) return absent;
    const entries = await this.table.workspaceHistory(user, id);
    if (part === "history" && !revision) return { status: 200, body: { workspaces: entries } };
    const record = entries.find((entry) => entry.revision === revision);
    return record ? this.download(user, record) : absent;
  }

  private async current(user: string, id: string, method: string): Promise<AccountReply> {
    const record = await this.table.workspace(user, id);
    if (!record) return absent;
    if (method === "GET") return this.download(user, record);
    if (method !== "DELETE") return absent;
    return this.remove(user, record);
  }

  private async download(user: string, record: WorkspaceRecord): Promise<AccountReply> {
    return {
      status: 200,
      body: { ...record, url: await this.services.signDownload(user, snapshotObject(record)) },
    };
  }

  private async prepare(
    user: string,
    id: string,
    body: Record<string, unknown>
  ): Promise<AccountReply> {
    const issue = problem(body);
    if (issue) return invalid(issue);
    const current = await this.table.workspace(user, id);
    if ((current?.revision ?? "") !== body.expectedRevision) return conflict();
    if (!current && (await this.table.workspaces(user)).length >= MAX_WORKSPACES)
      return { status: 409, body: { error: `An account can hold ${MAX_WORKSPACES} workspaces.` } };
    const released = (await this.table.workspaceHistory(user, id))
      .slice(4)
      .reduce((total, entry) => total + entry.size, 0);
    if (
      ((await this.table.profile(user))?.bytes ?? 0) + Number(body.size) - released >
      USER_STORAGE_BYTES
    )
      return { status: 409, body: { error: "This account's storage is full." } };
    const revision = this.services.newRevision();
    const url = await this.services.signUpload(
      user,
      snapshotObject({ id, revision }),
      Number(body.size),
      String(body.checksum)
    );
    return { status: 200, body: { url, revision } };
  }

  private async publish(
    user: string,
    id: string,
    body: Record<string, unknown>
  ): Promise<AccountReply> {
    const issue = problem(body);
    if (issue) return invalid(issue);
    const { expectedRevision } = body as unknown as SaveWorkspaceRequest;
    const current = await this.table.workspace(user, id);
    if ((current?.revision ?? "") !== expectedRevision) return conflict();
    const record = await this.uploadedRecord(user, id, body, current);
    if ("status" in record) return record;
    const pruned = (await this.table.workspaceHistory(user, id)).slice(4);
    const result = await this.table.commitWorkspace(user, record, expectedRevision, pruned);
    if (result === "conflict") return conflict();
    if (result === "full")
      return { status: 409, body: { error: "This account's storage is full." } };
    for (const old of pruned) await this.services.deleteObject(user, snapshotObject(old));
    return { status: 200, body: { revision: record.revision } };
  }

  private async uploadedRecord(
    user: string,
    id: string,
    body: Record<string, unknown>,
    current: WorkspaceRecord | null
  ): Promise<WorkspaceRecord | AccountFailure> {
    if (typeof body.revision !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.revision))
      return invalid("The uploaded revision is not valid.");
    const { size, checksum, roomId, name } = body as unknown as SaveWorkspaceRequest;
    const stored = await this.services.objectInfo(
      user,
      snapshotObject({ id, revision: body.revision })
    );
    if (stored?.size !== size || stored.checksum !== checksum)
      return invalid("The workspace upload is incomplete or damaged.");
    return {
      id,
      name: name.trim(),
      roomId,
      size,
      revision: body.revision,
      updated: Math.max(this.services.now(), (current?.updated ?? 0) + 1),
    };
  }

  private async remove(user: string, record: WorkspaceRecord): Promise<AccountReply> {
    const history = await this.table.workspaceHistory(user, record.id);
    if (!(await this.table.deleteWorkspace(user, record))) return conflict();
    for (const entry of history) await this.services.deleteObject(user, snapshotObject(entry));
    return { status: 200, body: {} };
  }

  async deleteAll(user: string) {
    for (const record of await this.table.workspaces(user)) {
      const reply = await this.remove(user, record);
      if (reply.status !== 200) return "A workspace changed. Try deleting your account again.";
    }
    return "";
  }
}
