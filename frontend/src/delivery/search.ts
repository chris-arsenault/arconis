import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { DocumentVersion } from "./project";
import { markdownHeadings } from "./references";

export const fileSearch = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .describe("Words to find in document titles, tags, headings, or text."),
  tag: z.string().optional().describe("Limit results to documents with this exact tag."),
  limit: z.int().min(1).max(50).default(20).describe("Maximum matching sections to return."),
});
export type FileSearch = z.infer<typeof fileSearch>;

export async function openSearchIndex(path = ":memory:", readOnly = false) {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(path, { readOnly });
}

function indexSections(body: string) {
  const headings = markdownHeadings(body);
  const selectors = new Set<string>();
  return [
    { heading: "", section: "", text: body.slice(0, headings[0]?.start) },
    ...headings.map((heading, i) => {
      const section = selectors.has(heading.selector) ? "" : heading.selector;
      heading.names.forEach((name) => selectors.add(name));
      return {
        heading: heading.title,
        section,
        text: body.slice(heading.end, headings[i + 1]?.start),
      };
    }),
  ];
}

export function buildSearchIndex(db: DatabaseSync, documents: readonly DocumentVersion[]) {
  db.exec(`
    CREATE VIRTUAL TABLE sections USING fts5(
      path UNINDEXED, section UNINDEXED, title, heading, tags, body, tokenize='porter unicode61'
    );
    BEGIN;
  `);
  const insert = db.prepare("INSERT INTO sections VALUES (?, ?, ?, ?, ?, ?)");
  for (const doc of documents) {
    const sections = indexSections(doc.body ?? "");
    for (const { heading, section, text } of sections) {
      if (heading || text.trim() || sections.length === 1)
        insert.run(doc.path, section, doc.title, heading, JSON.stringify(doc.tags), text);
    }
  }
  db.exec("COMMIT;");
}

export function searchIndex(db: DatabaseSync, input: FileSearch) {
  const terms = input.query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) return [];
  const words = terms.map((term) => `"${term}"`).join(" ");
  return db
    .prepare(
      `
    SELECT path, NULLIF(section, '') AS section, NULLIF(heading, '') AS heading, title,
      SUBSTR(TRIM(snippet(sections, 5, '', '', '…', 26), CHAR(9, 10, 13, 32)), 1, 350) AS excerpt
    FROM sections
    WHERE sections MATCH ? AND (? IS NULL OR ? IN (SELECT value FROM json_each(tags)))
    ORDER BY bm25(sections, 0, 0, 5, 3, 2, 1), path, rowid
    LIMIT ?
  `
    )
    .all(words, input.tag ?? null, input.tag ?? null, input.limit);
}

export async function searchDocuments(documents: readonly DocumentVersion[], input: FileSearch) {
  const db = await openSearchIndex();
  try {
    buildSearchIndex(
      db,
      documents.filter((doc) => doc.kind === "design")
    );
    return searchIndex(db, input);
  } finally {
    db.close();
  }
}
