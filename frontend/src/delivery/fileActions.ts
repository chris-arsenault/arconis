import { z } from "zod";
import { parse } from "../language/parser";
import {
  append,
  canonical,
  currentDocuments,
  docKinds,
  recordDocument,
  type Actor,
  type Project,
} from "./project";
import { path, lookup, projectWork } from "./work";
import { findItem } from "./workActions";
import { datasetSchema, readDataset, readRows, replaceSchema, setRows } from "./dataset";
import { describeLink, fragmentExists, markdownSection, splitRef } from "./references";

import { exportRows, importRows } from "./tableTransfer";

const metadata = { title: z.string().min(1), tags: z.array(z.string()).default([]), path };
const row = z.record(z.string(), z.json());
export function findDocument(p: Project, target: string) {
  const documents = currentDocuments(p);
  return (
    documents.find((doc) => doc.document === target || doc.path === target) ??
    documents.find((doc) => doc.title === target) ??
    lookup(documents, target, (doc) => doc.path)
  );
}

export function reference(p: Project, raw: string) {
  if (raw.startsWith("work:")) return `work:${findItem(p, raw.slice(5)).id}`;
  if (raw.startsWith("result:")) {
    const result = lookup(
      p.work.filter((e) => e.type === "result"),
      raw.slice(7),
      (e) => e.observation
    );
    return `result:${result.id}`;
  }
  const [target, fragment] = splitRef(raw);
  const document = findDocument(p, target.startsWith("file:") ? target.slice(5) : target);
  if (document.kind === "artifact") return `asset:${document.id}`;
  const selected = datasetFragment(document, fragment);
  return `file:${document.document}${selected ? "#" + selected : ""}`;
}
function datasetFragment(document: ReturnType<typeof findDocument>, fragment: string) {
  if (document.kind !== "dataset" || !fragment || fragment.startsWith("[")) return fragment;
  const data = readDataset(document.body ?? "");
  if (data.schema.keys.length !== 1)
    throw new Error("Use the dataset row's key values in schema order for a composite key.");
  const field = data.schema.fields[data.schema.keys[0]];
  return JSON.stringify([field.type === "integer" ? Number(fragment) : fragment]);
}

export function addLink(p: Project, actor: Actor, from: string, to: string, purpose: string) {
  if (from === to) throw new Error("Link two different targets.");
  for (const endpoint of [from, to]) {
    if (!endpoint.startsWith("file:")) continue;
    const [target, fragment] = splitRef(endpoint);
    if (!fragmentExists(findDocument(p, target.slice(5)), fragment))
      throw new Error("The selected document target does not exist.");
  }
  const old = Array.from(projectWork(p.work).links.values()).find(
    (l) => l.from === from && l.to === to && l.purpose === purpose
  );
  if (old) return old;
  return append(p, actor, { type: "link.add", link: { id: actor.id(), from, to, purpose } }).link;
}

export function linkBasis(p: Project, actor: Actor, work: string, sources: string[]) {
  for (const source of sources) addLink(p, actor, `work:${work}`, reference(p, source), "basis");
}

function writeDoc(
  p: Project,
  actor: Actor,
  a: {
    path: string;
    title: string;
    tags: string[];
    kind: (typeof docKinds)[number];
    body: string;
    format: "text" | "base64";
  }
) {
  if (a.path === "delivery.json") throw new Error("Choose a project document path.");
  const existing = currentDocuments(p).find((doc) => doc.path === a.path);
  if (existing && existing.kind !== a.kind)
    throw new Error("Use a path for this kind of document.");
  validateBody(a);
  return recordDocument(p, actor, { ...a, document: existing?.document ?? actor.id() });
}
function editDocument(
  p: Project,
  actor: Actor,
  target: string,
  kind: "dataset" | "design",
  body: (before: string) => string
) {
  const doc = findDocument(p, target);
  if (doc.kind !== kind || doc.body === null) throw new Error(`Select a ${kind} document.`);
  return recordDocument(p, actor, { ...doc, body: body(doc.body) });
}
const fileFilter = z.object({ kind: z.enum(docKinds).optional(), tag: z.string().optional() });
type FileFilter = z.infer<typeof fileFilter>;

export function listFiles(
  p: Project,
  a: FileFilter,
  storedSize?: (version: string) => number | undefined
) {
  return currentDocuments(p)
    .filter((d) => (!a.kind || d.kind === a.kind) && (!a.tag || d.tags.includes(a.tag)))
    .map(({ body, ...meta }) => ({ ...meta, size: storedSize?.(meta.id) ?? body?.length ?? 0 }));
}

export function linksFor(p: Project, target: string) {
  return Array.from(projectWork(p.work).links.values()).filter((link) =>
    [link.from, link.to].some(
      (endpoint) => endpoint === target || endpoint.startsWith(target + "#")
    )
  );
}

export const fileActions = {
  file_list: {
    schema: fileFilter,
    read: true,
    run: (p: Project, _: Actor, a: FileFilter) => listFiles(p, a),
  },
  file_read: {
    schema: z.object({ target: z.string(), section: z.string().optional() }),
    read: true,
    run: (p: Project, _: Actor, a: { target: string; section?: string }) => {
      const doc = findDocument(p, a.target);
      if (doc.format === "base64") throw new Error("Open or download the attachment.");
      return { ...doc, body: a.section ? markdownSection(doc.body ?? "", a.section) : doc.body };
    },
  },
  file_write: {
    schema: z.object({
      ...metadata,
      kind: z.enum(docKinds),
      body: z.string(),
      format: z.enum(["text", "base64"]).default("text"),
    }),
    read: false,
    run: writeDoc,
  },
  file_delete: {
    schema: z.object({ target: z.string() }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string }) =>
      recordDocument(p, actor, { ...findDocument(p, a.target), body: null }),
  },
  file_history: {
    schema: z.object({ target: z.string() }),
    read: true,
    run: (p: Project, _: Actor, a: { target: string }) =>
      p.documents.filter((d) => d.document === a.target || d.path === a.target),
  },
  design_edit: {
    schema: z.object({ target: z.string(), section: z.string(), body: z.string() }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; section: string; body: string }) =>
      editDocument(p, actor, a.target, "design", (before) =>
        markdownSection(before, a.section, a.body)
      ),
  },
  dataset_define: {
    schema: z.object({ ...metadata, schema: datasetSchema.shape.schema }),
    read: false,
    run: (
      p: Project,
      actor: Actor,
      a: {
        path: string;
        title: string;
        tags: string[];
        schema: z.infer<typeof datasetSchema>["schema"];
      }
    ) => {
      const doc = currentDocuments(p).find((doc) => doc.path === a.path);
      const body = doc?.body
        ? replaceSchema(doc.body, a.schema)
        : canonical({ schema: a.schema, items: [] });
      return writeDoc(p, actor, {
        path: a.path,
        title: a.title,
        tags: a.tags,
        body,
        kind: "dataset",
        format: "text",
      });
    },
  },
  dataset_read: {
    schema: z.object({
      target: z.string(),
      where: row.default({}),
      missing: z.array(z.string()).default([]),
      columns: z.array(z.string()).default([]),
      offset: z.int().nonnegative().default(0),
      limit: z.int().nonnegative().default(25),
    }),
    read: true,
    run: (
      p: Project,
      _: Actor,
      a: {
        target: string;
        where: z.infer<typeof row>;
        missing: string[];
        columns: string[];
        offset: number;
        limit: number;
      }
    ) => {
      const doc = findDocument(p, a.target);
      return readRows(
        readDataset(doc.body ?? ""),
        a.where,
        a.missing,
        a.columns,
        a.offset,
        a.limit
      );
    },
  },
  dataset_import: {
    schema: z.object({ target: z.string(), content: z.string(), format: z.enum(["csv", "jsonl"]) }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; content: string; format: string }) =>
      editDocument(p, actor, a.target, "dataset", (before) => {
        const data = readDataset(before);
        return setRows(data, importRows(data, a.content, a.format));
      }),
  },
  dataset_export: {
    schema: z.object({ target: z.string(), format: z.enum(["csv", "jsonl"]) }),
    read: true,
    run: (p: Project, _: Actor, a: { target: string; format: string }) =>
      exportRows(readDataset(findDocument(p, a.target).body ?? ""), a.format),
  },
  dataset_fill: {
    schema: z.object({ target: z.string(), items: z.array(row).min(1) }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; items: z.infer<typeof row>[] }) =>
      editDocument(p, actor, a.target, "dataset", (before) =>
        setRows(readDataset(before), a.items)
      ),
  },
  link_add: {
    schema: z.object({ from: z.string(), to: z.string(), purpose: z.string().min(1) }),
    read: false,
    run: (p: Project, actor: Actor, a: { from: string; to: string; purpose: string }) =>
      addLink(p, actor, reference(p, a.from), reference(p, a.to), a.purpose),
  },
  link_list: {
    schema: z.object({ target: z.string() }),
    read: true,
    run: (p: Project, _: Actor, a: { target: string }) =>
      linksFor(p, reference(p, a.target)).map((link) => describeLink(p, link)),
  },
  link_remove: {
    schema: z.object({ from: z.string(), to: z.string(), purpose: z.string() }),
    read: false,
    run: (p: Project, actor: Actor, a: { from: string; to: string; purpose: string }) => {
      const from = reference(p, a.from),
        to = reference(p, a.to);
      const link = Array.from(projectWork(p.work).links.values()).find(
        (l) => l.from === from && l.to === to && l.purpose === a.purpose
      );
      if (!link) throw new Error("Relationship not found.");
      return append(p, actor, { type: "link.remove", link: link.id });
    },
  },
};

export function linkArtifact(p: Project, actor: Actor, result: string, document: string) {
  return addLink(
    p,
    actor,
    reference(p, `result:${result}`),
    reference(p, `file:${document}`),
    "evidence"
  );
}
function validateBody(a: {
  kind: (typeof docKinds)[number];
  format: "text" | "base64";
  body: string;
}) {
  if (a.kind === "dataset") readDataset(a.body);
  if (a.kind === "diagram" && !parse(a.body).some((stmt) => stmt.kind === "header"))
    throw new Error("Use a portable Draw file with its arconis header.");
  if (a.kind === "artifact") z.base64().parse(a.body);
  if ((a.kind === "artifact") !== (a.format === "base64"))
    throw new Error("Use text for documents and base64 for attachment bytes.");
}
