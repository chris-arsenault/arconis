import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  append,
  canonical,
  currentDocuments,
  manifestFile,
  manifestSchema,
  recordDocument,
  type Actor,
  type Project,
} from "./project";
import { newWork, path } from "./work";
import { readDataset } from "./dataset";

const pendingFile = ".delivery-pending.json";
const lockFile = ".delivery.lock";
export const fileActor = (name = process.env.ARCONIS_AUTHOR || "Terminal"): Actor => ({
  name,
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
});
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

async function noMissing<T>(read: Promise<T>): Promise<T | null> {
  return read.catch((error: unknown) => {
    if (missing(error)) return null;
    throw error;
  });
}

export async function projectRoot(start = process.cwd()) {
  let dir = await realpath(start);
  for (;;) {
    if (await noMissing(stat(join(dir, manifestFile)))) return dir;
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error("No delivery.json found. Run delivery init or select --project.");
    dir = parent;
  }
}
export function initialProject(title: string, actor: Actor): Project {
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
export async function initLocal(directory: string, title: string, actor: Actor) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const project = initialProject(title, actor);
  const handle = await open(join(root, manifestFile), "wx", 0o644);
  try {
    await handle.writeFile(canonical(project));
    await handle.sync();
  } finally {
    await handle.close();
  }
  return project;
}

export async function installDownload(root: string, project: Project) {
  await mkdir(root, { recursive: true });
  const lock = await open(join(root, lockFile), "wx");
  try {
    if (await noMissing(lstat(join(root, manifestFile))))
      throw new Error("This directory already has a Delivery project.");
    await install(root, { ...project, work: [], documents: [] }, project);
  } finally {
    await lock.close();
    await rm(join(root, lockFile), { force: true });
  }
}

async function safePath(root: string, name: string) {
  path.parse(name);
  let current = root;
  for (const part of name.split("/")) {
    current = join(current, part);
    if ((await noMissing(lstat(current)))?.isSymbolicLink())
      throw new Error(`Project path crosses a symlink: ${name}`);
  }
  return current;
}

async function writeAtomic(target: string, data: Uint8Array | string) {
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    const existing = await noMissing(stat(target));
    const handle = await open(temp, "wx", existing?.mode ?? 0o644);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

const bytes = (body: string, format: string) =>
  Buffer.from(body, format === "base64" ? "base64" : "utf8");
function readManifest(text: string): Project {
  return manifestSchema.parse(JSON.parse(text) as unknown);
}

async function observeFiles(root: string, project: Project, actor: Actor) {
  for (const doc of currentDocuments(project)) {
    const file = await safePath(root, doc.path);
    const data = await noMissing(readFile(file));
    const body = data?.toString(doc.format === "base64" ? "base64" : "utf8") ?? null;
    if (body === doc.body) continue;
    if (doc.kind === "dataset" && body !== null) readDataset(body);
    const age = data ? (await stat(file)).mtime : new Date();
    recordDocument(project, { ...actor, now: () => age.toISOString() }, { ...doc, body });
  }
}

async function changesFor(root: string, base: Project, next: Project) {
  const before = new Map(currentDocuments(base).map((doc) => [doc.path, doc]));
  const after = new Map(currentDocuments(next).map((doc) => [doc.path, doc]));
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changes = [];
  for (const name of paths) {
    const previous = before.get(name);
    const doc = after.get(name);
    if (previous?.body === doc?.body && previous?.format === doc?.format) continue;
    if (name === manifestFile) throw new Error("Invalid project document path.");
    const target = await safePath(root, name);
    changes.push({ target, data: await plannedBytes(target, previous, doc) });
  }
  return changes;
}

async function plannedBytes(
  target: string,
  before: ReturnType<typeof currentDocuments>[number] | undefined,
  after: ReturnType<typeof currentDocuments>[number] | undefined
) {
  if (after?.body == null) return null;
  const data = bytes(after.body, after.format);
  const existing = before ? null : await noMissing(readFile(target));
  if (existing && !existing.equals(data))
    throw new Error(`A file outside Delivery already exists at ${target}.`);
  return data;
}

async function install(root: string, base: Project, next: Project) {
  const changes = await changesFor(root, base, next);
  await writeAtomic(join(root, pendingFile), canonical(next));
  for (const { target, data } of changes) {
    if (data === null) {
      await rm(target, { force: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeAtomic(target, data);
  }
  await writeAtomic(join(root, manifestFile), canonical(next));
  await rm(join(root, pendingFile), { force: true });
}

export async function withLocal<T>(
  root: string,
  actor: Actor,
  run: (project: Project) => Promise<T> | T
): Promise<T> {
  const lock = join(root, lockFile);
  const handle = await open(lock, "wx");
  try {
    const manifest = join(root, manifestFile);
    let base = readManifest(await readFile(manifest, "utf8"));
    const pending = await noMissing(readFile(join(root, pendingFile), "utf8"));
    if (pending) {
      const recovered = readManifest(pending);
      await install(root, base, recovered);
      base = recovered;
    }
    const next = structuredClone(base);
    await observeFiles(root, next, actor);
    const observed = structuredClone(next);
    const result = await run(next);
    if (canonical(base) !== canonical(next)) {
      await verifyObservedFiles(root, base, observed);
      await install(root, base, next);
    }
    return result;
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}
async function verifyObservedFiles(root: string, base: Project, observed: Project) {
  const files = new Map(currentDocuments(observed).map((doc) => [doc.path, doc]));
  for (const doc of currentDocuments(base)) {
    const expected = files.get(doc.path);
    const now = await noMissing(readFile(await safePath(root, doc.path)));
    const actual = now?.toString(doc.format === "base64" ? "base64" : "utf8") ?? null;
    if (actual !== (expected?.body ?? null))
      throw new Error(
        `The local file changed during the operation: ${doc.path}. Retry against the current project.`
      );
  }
}
