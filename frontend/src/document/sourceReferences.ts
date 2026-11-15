import type { SourceReference } from "./types";

/** Metadata syntax only: no filesystem access or source existence checks. */
export function sourceReferenceProblem({ path, anchor }: SourceReference) {
  const parts = path.replace(/\/$/, "").split("/");
  if (
    !path ||
    path.includes("\\") ||
    path.includes(":") ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    return "Use a repository-relative path with / separators, without . or .. segments.";
  if (
    [path, anchor].some((text) => text.includes("\n") || text.includes("\r") || text.includes("\0"))
  )
    return "Source paths and anchors must be single-line text without null characters.";
  return "";
}

export function canonicalSources(sources: SourceReference[]) {
  const unique = new Map(
    sources.map((source) => [JSON.stringify([source.path, source.anchor]), source])
  );
  return [...unique.values()].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.anchor === b.anchor) return 0;
    return a.anchor < b.anchor ? -1 : 1;
  });
}

/** Peers and older documents can supply unknown records; retain only valid reference metadata. */
// Arconis: docs/diagrams/repository-links.arconis#item=source_reader — reads portable reference metadata without a checkout.
export function readSources(value: unknown): SourceReference[] {
  if (!Array.isArray(value)) return [];
  return canonicalSources(
    value
      .filter((entry: unknown): entry is SourceReference => {
        if (!entry || typeof entry !== "object") return false;
        const source = entry as Partial<SourceReference>;
        return (
          typeof source.path === "string" &&
          typeof source.anchor === "string" &&
          !sourceReferenceProblem(source as SourceReference)
        );
      })
      .map(({ path, anchor }) => ({ path, anchor }))
  );
}
