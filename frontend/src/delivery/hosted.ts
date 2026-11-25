import { z } from "zod";
import { operations, runDelivery, type Command } from "./actions";
import {
  append,
  canonical,
  manifestSchema,
  mergeProject,
  type Actor,
  type DocumentVersion,
  type Head,
  type Project,
} from "./project";
import { fileActions, findDocument, linkArtifact, listFiles } from "./fileActions";
import { id, newWork, path, projectWork } from "./work";
import { argumentsOf, command, splitEdit } from "./commands";
import { datasetCommand } from "./datasetCli";
import { HostedDocumentSearch } from "./hostedSearch";
import { fileSearch } from "./search";
import {
  decodeStoredProject,
  encodeStoredProject,
  hydrateDocument,
  hydrateForCommand,
  loadBody,
  mapDocuments,
  reuseIncomingBodies,
  type StoredProject,
} from "./storedProject";
export { headSchema, type Head } from "./project";

export const deliveryApiPath = "/api/delivery";
export const deliveryMcpPath = "/delivery/mcp";
export const deliveryDiscoveryPath = "/.well-known/oauth-protected-resource/delivery/mcp";
export const deliveryScope = "edit:delivery";
export type Grant = { url: string; headers: Record<string, string> };
export interface DeliveryStorage {
  list(user: string): Promise<Head[]>;
  readHead(user: string, project: string): Promise<{ head: Head; etag: string } | null>;
  readObject(user: string, project: string, name: string): Promise<Uint8Array>;
  writeObject(
    user: string,
    project: string,
    name: string,
    body: string | Uint8Array
  ): Promise<void>;
  hasObject(user: string, project: string, name: string): Promise<boolean>;
  signObject(user: string, project: string, name: string): Promise<string>;
  publish(user: string, head: Head, etag: string | null): Promise<boolean>;
  stage(
    user: string,
    project: string,
    transfer: string,
    size: number,
    checksum: string
  ): Promise<Grant>;
  readStage(user: string, project: string, transfer: string): Promise<string>;
  asset(
    user: string,
    project: string,
    version: string,
    bytes: Uint8Array,
    type: string,
    name: string
  ): Promise<string>;
}

const versionObject = (revision: string) => `versions/${revision}.json`;
const bodyObject = (digest: string) => `content/${digest}.json`;

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
  private search: HostedDocumentSearch;

  constructor(
    private storage: DeliveryStorage,
    private origin: string
  ) {
    this.search = new HostedDocumentSearch(storage);
  }

  private link(project: string) {
    return this.origin + deliveryApiPath + "/" + project;
  }
  list(user: string) {
    return this.storage.list(user);
  }

  private async text(user: string, project: string, name: string) {
    return Buffer.from(await this.storage.readObject(user, project, name)).toString("utf8");
  }

  private bodies(user: string, project: string) {
    return (digest: string) => this.text(user, project, bodyObject(digest));
  }

  private async read(user: string, project: string) {
    id.parse(project);
    const stored = await this.storage.readHead(user, project);
    if (!stored) return null;
    const value = decodeStoredProject(
      await this.text(user, project, versionObject(stored.head.revision))
    );
    return { ...value, ...stored };
  }
  private async require(user: string, project: string) {
    const result = await this.read(user, project);
    if (!result) throw new DeliveryError(404, "Project not found.");
    return result;
  }
  async download(user: string, project: string, incoming?: Project) {
    const stored = await this.require(user, project);
    const name = stored.legacy
      ? versionObject(stored.head.revision)
      : `bundles/${stored.head.revision}.json`;
    if (!stored.legacy && !(await this.storage.hasObject(user, project, name))) {
      if (incoming) reuseIncomingBodies(stored, incoming);
      const reader = this.bodies(user, project);
      const cache = new Map<string, Promise<string>>();
      const documents = await mapDocuments(stored.project.documents, async (doc) => ({
        ...doc,
        body: await loadBody(stored, doc, (digest) => {
          const pending = cache.get(digest) ?? reader(digest);
          cache.set(digest, pending);
          return pending;
        }),
      }));
      await this.storage.writeObject(
        user,
        project,
        name,
        canonical({ ...stored.project, documents })
      );
    }
    return {
      ...stored.head,
      url: await this.storage.signObject(user, project, name),
    };
  }
  private async commit(
    user: string,
    project: Project,
    previous?: StoredProject & { etag: string }
  ) {
    project.server = this.link(project.id);
    project.title = projectWork(project.work).items.get(project.root)?.title ?? project.title;
    const { body, size } = await encodeStoredProject(
      project,
      previous?.refs ?? new Map(),
      (digest, content) => this.storage.writeObject(user, project.id, bodyObject(digest), content)
    );
    const head = {
      revision: crypto.randomUUID(),
      title: project.title,
      project: project.id,
      size,
    };
    await this.storage.writeObject(user, project.id, versionObject(head.revision), body);
    return (await this.storage.publish(user, head, previous?.etag ?? null)) ? head : null;
  }
  async create(user: string, title: string) {
    const project = newProject(title, hostedActor(user));
    const head = await this.commit(user, project);
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
      if (existing) reuseIncomingBodies(existing, incoming);
      const merged = existing ? mergeProject(incoming, existing.project) : incoming;
      if (existing && canonical(existing.project) === canonical(merged))
        return this.download(user, project, incoming);
      if (await this.commit(user, merged, existing ?? undefined))
        return this.download(user, project, incoming);
    }
    throw new DeliveryError(409, "Project changed during sync. Run sync again.");
  }
  async call(user: string, project: string, edit: Command) {
    const stored = await this.require(user, project);
    const get = this.bodies(user, project);
    if (edit.operation === "file_search")
      return this.search.find(user, stored.project, fileSearch.parse(edit.args), (doc) =>
        loadBody(stored, doc, get)
      );
    const result = await this.execute(stored, hostedActor(user), edit, get);
    const operation = operations[edit.operation];
    if (operation.read) return result;
    if (!(await this.commit(user, stored.project, stored)))
      throw new DeliveryError(409, "Project changed. Read it and retry the edit.");
    return result;
  }
  private async execute(
    stored: StoredProject,
    actor: Actor,
    edit: Command,
    get: ReturnType<DeliveryService["bodies"]>
  ) {
    if (edit.operation === "file_list")
      return listFiles(
        stored.project,
        fileActions.file_list.schema.parse(edit.args ?? {}),
        (version) => stored.refs.get(version)?.length
      );
    await hydrateForCommand(stored, edit, get);
    return runDelivery(stored.project, actor, edit);
  }
  async batch(user: string, project: string, target: string, edits: string[]) {
    const stored = await this.require(user, project);
    const actor = hostedActor(user);
    const get = this.bodies(user, project);
    const results = [];
    for (const line of edits) {
      const args = argumentsOf(splitEdit(line));
      if (args.words[0] === "dataset" && args.words[1] !== "define" && args.words[2])
        await hydrateDocument(stored, findDocument(stored.project, args.words[2]), get);
      const edit =
        args.words[0] === "dataset" ? datasetCommand(stored.project, args) : command(args, target);
      results.push(await this.execute(stored, actor, edit, get));
    }
    if (!(await this.commit(user, stored.project, stored)))
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
    const bytes = await this.fileBytes(user, stored, doc);
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
  private async fileBytes(user: string, stored: StoredProject, doc: DocumentVersion) {
    const body = await loadBody(stored, doc, this.bodies(user, stored.project.id));
    return Buffer.from(body ?? "", doc.format === "base64" ? "base64" : "utf8");
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
    if (!(await this.commit(user, stored.project, stored)))
      throw new DeliveryError(409, "Project changed. Re-read and retry attachment.");
    return { path: document.path, document: document.document };
  }
}
