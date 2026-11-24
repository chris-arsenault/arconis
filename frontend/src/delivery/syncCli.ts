import { resolve } from "node:path";
import { DeliveryClient } from "./client";
import { cliToken } from "./login";
import { installDownload, projectRoot, withLocal } from "./local";
import { currentDocuments, mergeProject, type Actor } from "./project";

const defaultOrigin = "https://relay.arconis.ahara.io";
function remote(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Use an HTTPS Arconis Delivery server.");
  if (url.username || url.password) throw new Error("Use a bare server link.");
  const match = /^\/api\/delivery\/([a-z0-9_-]+)\/?$/.exec(url.pathname);
  if (url.pathname !== "/" && !match)
    throw new Error("Use the server origin or the full project link.");
  return { origin: url.origin, project: match?.[1] };
}
function client(origin: string) {
  let token: Promise<string> | undefined;
  return new DeliveryClient(origin, () => (token ??= cliToken(origin)));
}
export async function syncCli(directory: string, actor: Actor, link?: string) {
  const target = link ? remote(link) : null;
  const root = await projectRoot(directory).catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("No delivery.json")) return null;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (!root) {
    if (!target?.project)
      throw new Error("Supply a project link to download into a new directory.");
    const downloaded = await client(target.origin).read(target.project);
    await installDownload(resolve(directory), downloaded);
    return {
      project: downloaded.title,
      server: downloaded.server,
      files: currentDocuments(downloaded).map((doc) => doc.path),
    };
  }
  return withLocal(root, actor, async (project) => {
    const selected = target ?? remote(project.server ?? defaultOrigin);
    if (selected.project && selected.project !== project.id)
      throw new Error("The link identifies a different project.");
    if (project.server && remote(project.server).origin !== selected.origin)
      throw new Error("This copy already has a server.");
    const before = new Map(currentDocuments(project).map((doc) => [doc.path, doc.id]));
    const received = await client(selected.origin).sync(project);
    Object.assign(project, mergeProject(project, received));
    const after = new Map(currentDocuments(project).map((doc) => [doc.path, doc.id]));
    const files = Array.from(new Set([...before.keys(), ...after.keys()])).filter(
      (path) => before.get(path) !== after.get(path)
    );
    return { project: project.title, server: project.server, files };
  });
}
