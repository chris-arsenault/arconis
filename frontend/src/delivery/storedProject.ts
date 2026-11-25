import { createHash } from "node:crypto";
import { z } from "zod";
import type { Command } from "./actions";
import { findDocument, linksFor, reference } from "./fileActions";
import {
  canonical,
  currentDocuments,
  documentVersion,
  manifestSchema,
  type DocumentVersion,
  type Project,
} from "./project";
import { splitRef } from "./references";
import { findItem } from "./workActions";

type ReadBody = (digest: string) => Promise<string>;

const bodyRef = z.strictObject({
  digest: z.hex().length(64),
  bytes: z.int().positive(),
  length: z.int().nonnegative(),
});
const storedManifest = manifestSchema.extend({
  format: z.literal(2),
  documents: z.array(documentVersion.omit({ body: true }).extend({ content: bodyRef.nullable() })),
});
type BodyRef = z.infer<typeof bodyRef>;

export type StoredProject = {
  project: Project;
  refs: Map<string, BodyRef>;
  legacy: boolean;
  loaded: Set<string>;
};

export function decodeStoredProject(text: string): StoredProject {
  const raw: unknown = JSON.parse(text);
  const manifest = storedManifest.safeParse(raw);
  const refs = new Map<string, BodyRef>();
  const loaded = new Set<string>();
  if (!manifest.success) return { project: manifestSchema.parse(raw), refs, loaded, legacy: true };
  const project: Project = {
    ...manifest.data,
    format: 1,
    documents: manifest.data.documents.map(({ content, ...doc }) => {
      if (content) refs.set(doc.id, content);
      // Keep deletion semantics in the shared model. Load live bodies for the commands that need them.
      return { ...doc, body: content ? "" : null };
    }),
  };
  return { project, refs, loaded, legacy: false };
}

export const digest = (text: string) => createHash("sha256").update(text).digest("hex");

export async function mapDocuments<T>(
  docs: readonly DocumentVersion[],
  read: (doc: DocumentVersion) => Promise<T>
) {
  const results: T[] = [];
  for (let i = 0; i < docs.length; i += 24) {
    results.push(...(await Promise.all(docs.slice(i, i + 24).map(read))));
  }
  return results;
}

export async function encodeStoredProject(
  project: Project,
  refs: ReadonlyMap<string, BodyRef>,
  put: (digest: string, body: string) => Promise<void>
) {
  const known = new Set(Array.from(refs.values(), (ref) => ref.digest));
  const documents = await mapDocuments(project.documents, async ({ body, ...doc }) => {
    if (body === null) return { ...doc, content: null };
    const existing = refs.get(doc.id);
    if (existing) return { ...doc, content: existing };
    const encoded = JSON.stringify(body);
    const hash = digest(encoded);
    if (!known.has(hash)) {
      known.add(hash);
      await put(hash, encoded);
    }
    return {
      ...doc,
      content: { digest: hash, bytes: Buffer.byteLength(encoded), length: body.length },
    };
  });
  const skeleton: Project = {
    ...project,
    documents: documents.map(({ content, ...doc }) => ({ ...doc, body: content ? "" : null })),
  };
  const size =
    Buffer.byteLength(canonical(skeleton)) +
    documents.reduce((bytes, { content }) => bytes + (content ? content.bytes - 2 : 0), 0);
  return { body: canonical({ ...project, format: 2, documents }), size };
}

export async function loadBody(stored: StoredProject, doc: DocumentVersion, get: ReadBody) {
  const ref = stored.refs.get(doc.id);
  return ref && !stored.loaded.has(doc.id)
    ? z.string().parse(JSON.parse(await get(ref.digest)))
    : doc.body;
}

export async function hydrateDocument(stored: StoredProject, doc: DocumentVersion, get: ReadBody) {
  doc.body = await loadBody(stored, doc, get);
  stored.loaded.add(doc.id);
}

async function hydrateReferences(
  stored: StoredProject,
  endpoints: string[],
  get: ReadBody,
  canonicalRefs = false
) {
  const documents = new Set<DocumentVersion>();
  const current = canonicalRefs ? currentDocuments(stored.project) : [];
  for (const endpoint of endpoints) {
    if (endpoint.startsWith("work:") || endpoint.startsWith("result:")) continue;
    const [name, fragment] = splitRef(endpoint);
    if (!fragment) continue;
    const target = name.startsWith("file:") ? name.slice(5) : name;
    const doc = canonicalRefs
      ? current.find((item) => item.document === target)
      : findDocument(stored.project, target);
    if (doc) documents.add(doc);
  }
  await mapDocuments([...documents], (doc) => hydrateDocument(stored, doc, get));
}

const readsContent = new Set([
  "file_read",
  "design_edit",
  "dataset_read",
  "dataset_import",
  "dataset_export",
  "dataset_fill",
]);

export function hydrateForCommand(stored: StoredProject, edit: Command, get: ReadBody) {
  if (!stored.refs.size) return;
  const { project } = stored;
  const { target, path } = edit.args ?? {};
  if (readsContent.has(edit.operation) && typeof target === "string")
    return hydrateDocument(stored, findDocument(project, target), get);
  if (edit.operation === "dataset_define") {
    const doc = currentDocuments(project).find((candidate) => candidate.path === path);
    return doc ? hydrateDocument(stored, doc, get) : undefined;
  }
  if (edit.operation === "file_history") {
    const versions = project.documents.filter(
      (doc) => doc.document === target || doc.path === target
    );
    return mapDocuments(versions, (doc) => hydrateDocument(stored, doc, get));
  }
  return hydrateLinkCommand(stored, edit, get);
}

function hydrateLinkCommand(stored: StoredProject, edit: Command, get: ReadBody) {
  const { target, from, to } = edit.args ?? {};
  if (edit.operation === "link_add" || edit.operation === "link_remove")
    return hydrateReferences(
      stored,
      [from, to].filter((endpoint) => typeof endpoint === "string"),
      get
    );
  if (edit.operation === "work_add" && Array.isArray(from))
    return hydrateReferences(
      stored,
      from.filter((endpoint) => typeof endpoint === "string"),
      get
    );
  if (typeof target !== "string") return;
  if (edit.operation === "work_read" || edit.operation === "link_list")
    return hydrateLinkedTarget(stored, target, edit.operation === "work_read", get);
}

async function hydrateLinkedTarget(
  stored: StoredProject,
  target: string,
  isWork: boolean,
  get: ReadBody
) {
  const { project } = stored;
  if (!isWork) await hydrateReferences(stored, [target], get);
  const endpoint = isWork ? `work:${findItem(project, target).id}` : reference(project, target);
  const related = linksFor(project, endpoint).flatMap((link) => [link.from, link.to]);
  await hydrateReferences(stored, related, get, true);
}

// A local copy can supply a remote version's bytes after proving it is the same record.
export function reuseIncomingBodies(stored: StoredProject, incoming: Project) {
  const incomingById = new Map(incoming.documents.map((doc) => [doc.id, doc]));
  for (const remote of stored.project.documents) {
    const ref = stored.refs.get(remote.id);
    const local = incomingById.get(remote.id);
    if (!ref || !local) continue;
    if (digest(JSON.stringify(local.body)) !== ref.digest)
      throw new Error("A project record has inconsistent contents.");
    remote.body = local.body;
    stored.loaded.add(remote.id);
  }
}
