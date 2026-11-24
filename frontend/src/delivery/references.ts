import { parse } from "../language/parser";
import type { Statement } from "../language/syntax";
import { readDataset, rowKey } from "./dataset";
import { currentDocuments, type DocumentVersion, type Project } from "./project";
import { projectWork, type Relation } from "./work";

export function splitRef(raw: string) {
  const at = raw.indexOf("#");
  return at < 0 ? [raw, ""] : [raw.slice(0, at), raw.slice(at + 1)];
}

function mayContainObject(stmt: Statement, name: string): boolean {
  if (stmt.kind === "arrange")
    return named(stmt.identity, name) || diagramContains(stmt.body, name);
  if (stmt.kind === "link") return named(stmt.identity, name);
  if (stmt.kind !== "item") return false;
  return (
    named(stmt.identity, name) ||
    (stmt.body.kind === "block" && diagramContains(stmt.body.statements, name))
  );
}
function named(identity: import("../language/syntax").RequestedId, name: string) {
  return identity.kind === "named" && identity.id === name;
}
function diagramContains(statements: Statement[], name: string): boolean {
  return statements.some((stmt) => mayContainObject(stmt, name));
}
function sectionNames(heading: string) {
  const anchor = / \{#([a-zA-Z0-9_-]+)\}$/.exec(heading);
  return anchor ? [heading.slice(0, anchor.index).trim(), anchor[1]] : [heading.trim()];
}
export function markdownSection(body: string, title: string, replacement?: string) {
  const headings = Array.from(body.matchAll(/^(#{1,6}) (.*)$/gm));
  const current = headings.find((m) => sectionNames(m[2]).includes(title));
  if (!current) throw new Error(`Unknown section: ${title}`);
  const start = current.index + current[0].length;
  const end =
    headings.find((m) => m.index > current.index && m[1].length <= current[1].length)?.index ??
    body.length;
  return replacement === undefined
    ? body.slice(start, end).trim()
    : body.slice(0, start) + "\n\n" + replacement.trim() + "\n\n" + body.slice(end);
}
export function fragmentExists(doc: DocumentVersion, fragment: string) {
  if (!fragment) return doc.body !== null;
  try {
    const body = doc.body ?? "";
    if (doc.kind === "design") {
      markdownSection(body, fragment);
      return true;
    }
    if (doc.kind === "dataset") {
      const data = readDataset(body);
      return data.items.some((row) => rowKey(data, row) === fragment);
    }
    return doc.kind === "diagram" && diagramContains(parse(body), fragment);
  } catch {
    return false;
  }
}

export function describeEndpoint(project: Project, endpoint: string) {
  const [target, fragment] = splitRef(endpoint);
  const [kind, id] = target.split(":");
  if (kind === "work") {
    const item = projectWork(project.work).items.get(id);
    return { kind, id, fragment, label: item?.title ?? id, live: !!item && !item.retired };
  }
  if (kind === "result") {
    const result = project.work
      .filter((change) => change.type === "result")
      .find((change) => change.id === id);
    return {
      kind,
      id,
      fragment,
      label: result?.observation ?? id,
      live: !!result,
    };
  }
  return describeFile(project, kind, id, fragment);
}
function describeFile(project: Project, kind: string, id: string, fragment: string) {
  const doc =
    kind === "asset"
      ? project.documents.find((doc) => doc.id === id)
      : currentDocuments(project).find((doc) => doc.document === id);
  const latest = doc ?? project.documents.filter((doc) => doc.document === id).at(-1);
  return {
    kind,
    id,
    fragment,
    label: latest?.title ?? id,
    live: !!doc && fragmentExists(doc, fragment),
  };
}

export const describeLink = (project: Project, link: Relation) => ({
  ...link,
  source: describeEndpoint(project, link.from),
  target: describeEndpoint(project, link.to),
});
