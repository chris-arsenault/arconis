import { z } from "zod";
import { event, id, order, path, type EventBody } from "./work";

const stampFields = { id, at: z.iso.datetime(), actor: z.string().min(1) };
export const docKinds = ["design", "dataset", "diagram", "artifact"] as const;
export const documentVersion = z.strictObject({
  ...stampFields,
  document: id,
  path,
  kind: z.enum(docKinds),
  title: z.string().min(1),
  tags: z.array(z.string()),
  format: z.enum(["text", "base64"]),
  body: z.string().nullable(),
});
export type DocumentVersion = z.infer<typeof documentVersion>;
export const manifestSchema = z.strictObject({
  format: z.literal(1),
  id,
  title: z.string().min(1),
  server: z.url().nullable(),
  root: id,
  work: z.array(event),
  documents: z.array(documentVersion),
});
export type Project = z.infer<typeof manifestSchema>;
export type Actor = { name: string; now: () => string; id: () => string };
export const headSchema = z.strictObject({
  revision: id,
  title: z.string(),
  project: id,
  size: z.int().nonnegative(),
});
export type Head = z.infer<typeof headSchema>;

export const manifestFile = "delivery.json";
export const canonical = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
export function currentDocuments(project: Project) {
  const latest = new Map(project.documents.map((doc) => [doc.document, doc]));
  return Array.from(
    new Map(
      [...latest.values()]
        .sort(order)
        .filter((doc) => doc.body !== null)
        .map((doc) => [doc.path, doc])
    ).values()
  );
}
export function stamp(actor: Actor, last = "") {
  const time = actor.now();
  const at = time > last ? time : new Date(Date.parse(last) + 1).toISOString();
  return { id: actor.id(), at, actor: actor.name };
}

export function append<T extends EventBody>(project: Project, actor: Actor, body: T) {
  const change = { ...body, ...stamp(actor, project.work.at(-1)?.at) };
  project.work.push(event.parse(change));
  return change;
}
export function recordDocument(
  project: Project,
  actor: Actor,
  value: Omit<DocumentVersion, "id" | "at" | "actor">
) {
  const last = project.documents.filter((doc) => doc.document === value.document).at(-1)?.at;
  const change = documentVersion.parse({ ...value, ...stamp(actor, last) });
  project.documents.push(change);
  project.documents.sort(order);
  return change;
}

function collect<T extends { id: string; at: string }>(a: T[], b: T[]) {
  const merged = new Map(a.map((change) => [change.id, change]));
  for (const change of b) {
    const previous = merged.get(change.id);
    if (previous && canonical(previous) !== canonical(change))
      throw new Error("A project record has inconsistent contents.");
    merged.set(change.id, change);
  }
  return Array.from(merged.values()).sort(order);
}

export function mergeProject(local: Project, remote: Project): Project {
  if (local.id !== remote.id || local.root !== remote.root)
    throw new Error("The server link identifies a different project.");
  return {
    ...local,
    server: remote.server ?? local.server,
    work: collect(local.work, remote.work),
    documents: collect(local.documents, remote.documents),
  };
}
