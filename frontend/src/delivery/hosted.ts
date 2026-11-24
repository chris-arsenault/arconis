import { z } from "zod";
import { operations, runDelivery, type Command } from "./actions";
import {
  append,
  canonical,
  manifestSchema,
  mergeProject,
  type Actor,
  type Project,
} from "./project";
import { fileActions, findDocument, linkArtifact } from "./fileActions";
import { id, newWork, path, projectWork } from "./work";
import { argumentsOf, command, splitEdit } from "./commands";
import { datasetCommand } from "./datasetCli";

export const deliveryApiPath = "/api/delivery";
export const deliveryMcpPath = "/delivery/mcp";
export const deliveryDiscoveryPath = "/.well-known/oauth-protected-resource/delivery/mcp";
export const deliveryScope = "edit:delivery";
export const headSchema = z.strictObject({
  revision: id,
  title: z.string(),
  project: id,
  size: z.int().nonnegative(),
});
export type Head = z.infer<typeof headSchema>;
export type Grant = { url: string; headers: Record<string, string> };
export interface DeliveryStorage {
  list(user: string): Promise<Head[]>;
  readHead(user: string, project: string): Promise<{ head: Head; etag: string } | null>;
  readVersion(user: string, project: string, version: string): Promise<string>;
  writeVersion(user: string, project: string, version: string, body: string): Promise<void>;
  publish(user: string, head: Head, etag: string | null): Promise<boolean>;
  stage(
    user: string,
    project: string,
    transfer: string,
    size: number,
    checksum: string
  ): Promise<Grant>;
  readStage(user: string, project: string, transfer: string): Promise<string>;
  getVersion(user: string, project: string, version: string): Promise<string>;
  asset(
    user: string,
    project: string,
    version: string,
    bytes: Uint8Array,
    type: string,
    name: string
  ): Promise<string>;
}

export function newProject(title: string, actor: Actor): Project {
  const root = actor.id();
  const project = manifestSchema.parse({
    format: 1,
    id: actor.id(),
    title,
    server: null,
    root,
    work: [],
    documents: [],
  });
  append(project, actor, {
    type: "work.add",
    item: { ...newWork(root, title, null), status: "active" },
  });
  return project;
}

const decode = (body: string) => manifestSchema.parse(JSON.parse(body) as unknown);
export const hostedActor = (name: string): Actor => ({
  name,
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
});
export const checksumSchema = z
  .base64()
  .refine((value) => value.length === 44, "Expected a base64 SHA-256 digest");
export const uploadSchema = z.object({ size: z.int().nonnegative(), checksum: checksumSchema });
export class DeliveryError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export class DeliveryService {
  constructor(
    private storage: DeliveryStorage,
    private origin: string
  ) {}

  private link(project: string) {
    return this.origin + deliveryApiPath + "/" + project;
  }
  list(user: string) {
    return this.storage.list(user);
  }

  private async read(user: string, project: string) {
    id.parse(project);
    const stored = await this.storage.readHead(user, project);
    if (!stored) return null;
    const value = decode(await this.storage.readVersion(user, project, stored.head.revision));
    return { project: value, etag: stored.etag, head: stored.head };
  }
  private async require(user: string, project: string) {
    const result = await this.read(user, project);
    if (!result) throw new DeliveryError(404, "Project not found.");
    return result;
  }
  async download(user: string, project: string) {
    id.parse(project);
    const stored = await this.storage.readHead(user, project);
    if (!stored) throw new DeliveryError(404, "Project not found.");
    return {
      ...stored.head,
      url: await this.storage.getVersion(user, project, stored.head.revision),
    };
  }
  private async commit(user: string, project: Project, etag: string | null) {
    project.server = this.link(project.id);
    project.title = projectWork(project.work).items.get(project.root)?.title ?? project.title;
    const body = canonical(project);
    const head = {
      revision: crypto.randomUUID(),
      title: project.title,
      project: project.id,
      size: new TextEncoder().encode(body).length,
    };
    await this.storage.writeVersion(user, project.id, head.revision, body);
    return (await this.storage.publish(user, head, etag)) ? head : null;
  }
  async create(user: string, title: string) {
    const project = newProject(title, hostedActor(user));
    const head = await this.commit(user, project, null);
    if (!head) throw new DeliveryError(409, "Project already exists.");
    return { ...head, link: project.server };
  }
  async stage(user: string, project: string, size: number, checksum: string) {
    id.parse(project);
    const transfer = crypto.randomUUID();
    return { transfer, ...(await this.storage.stage(user, project, transfer, size, checksum)) };
  }
  async finish(user: string, project: string, transfer: string) {
    id.parse(project);
    id.parse(transfer);
    const incoming = decode(
      Buffer.from(await this.storage.readStage(user, project, transfer), "base64").toString("utf8")
    );
    if (incoming.id !== project)
      throw new DeliveryError(400, "Upload belongs to a different project.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.read(user, project);
      const merged = existing ? mergeProject(incoming, existing.project) : incoming;
      if (existing && canonical(existing.project) === canonical(merged))
        return this.download(user, project);
      if (await this.commit(user, merged, existing?.etag ?? null))
        return this.download(user, project);
    }
    throw new DeliveryError(409, "Project changed during sync. Run sync again.");
  }
  async call(user: string, project: string, edit: Command) {
    const stored = await this.require(user, project);
    const result = runDelivery(stored.project, hostedActor(user), edit);
    const operation = operations[edit.operation];
    if (operation.read) return result;
    if (!(await this.commit(user, stored.project, stored.etag)))
      throw new DeliveryError(409, "Project changed. Read it and retry the edit.");
    return result;
  }
  async batch(user: string, project: string, target: string, edits: string[]) {
    const stored = await this.require(user, project);
    const actor = hostedActor(user);
    const results = edits.map((line) => {
      const args = argumentsOf(splitEdit(line));
      const edit =
        args.words[0] === "dataset" ? datasetCommand(stored.project, args) : command(args, target);
      return runDelivery(stored.project, actor, edit);
    });
    if (!(await this.commit(user, stored.project, stored.etag)))
      throw new DeliveryError(409, "Project changed. Read it and retry the batch.");
    return results;
  }
  async readFile(user: string, project: string, target: string) {
    const stored = await this.require(user, project);
    const doc = target.startsWith("asset:")
      ? stored.project.documents.find(
          (doc) => doc.id === target.slice(6) && doc.kind === "artifact"
        )
      : findDocument(stored.project, target);
    if (!doc || doc.body === null) throw new DeliveryError(404, "Attachment not found.");
    const bytes = Buffer.from(doc.body ?? "", doc.format === "base64" ? "base64" : "utf8");
    return {
      title: doc.title,
      path: doc.path,
      version: doc.id,
      url: await this.storage.asset(
        user,
        project,
        doc.id,
        bytes,
        "application/octet-stream",
        doc.path.split("/").at(-1) ?? "attachment"
      ),
    };
  }
  async attach(user: string, project: string, raw: unknown) {
    const input = z.object({ target: z.string(), path, transfer: id }).parse(raw);
    const stored = await this.require(user, project);
    const body = await this.storage.readStage(user, project, input.transfer);
    const actor = hostedActor(user);
    const document = fileActions.file_write.run(stored.project, actor, {
      body,
      format: "base64",
      kind: "artifact",
      path: input.path,
      title: input.path,
      tags: [],
    });
    linkArtifact(stored.project, actor, input.target, document.document);
    if (!(await this.commit(user, stored.project, stored.etag)))
      throw new DeliveryError(409, "Project changed. Re-read and retry attachment.");
    return { path: document.path, document: document.document };
  }
}
