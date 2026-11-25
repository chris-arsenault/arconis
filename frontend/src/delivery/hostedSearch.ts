import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { DeliveryStorage } from "./hosted";
import { currentDocuments, type DocumentVersion, type Project } from "./project";
import { buildSearchIndex, openSearchIndex, searchIndex, type FileSearch } from "./search";
import { digest, mapDocuments } from "./storedProject";

type Index = { db: DatabaseSync; directory: string };

export class HostedDocumentSearch {
  private cached: { key: string; index: Index } | undefined;

  constructor(private storage: Pick<DeliveryStorage, "hasObject" | "readObject" | "writeObject">) {}

  async find(
    user: string,
    project: Project,
    input: FileSearch,
    load: (doc: DocumentVersion) => Promise<string | null>
  ) {
    const documents = currentDocuments(project).filter((doc) => doc.kind === "design");
    if (!documents.length) return [];
    const revision = digest(
      JSON.stringify([1, documents.map((doc) => doc.id).sort((a, b) => a.localeCompare(b, "en"))])
    );
    const key = JSON.stringify([user, project.id, revision]);
    if (this.cached?.key === key) return searchIndex(this.cached.index.db, input);

    const index = await this.open(user, project.id, revision, async () =>
      mapDocuments(documents, async (doc) => ({ ...doc, body: await load(doc) }))
    );
    const previous = this.cached?.index;
    this.cached = { key, index };
    const results = searchIndex(index.db, input);
    if (previous) await dispose(previous);
    return results;
  }

  private async open(
    user: string,
    project: string,
    revision: string,
    load: () => Promise<DocumentVersion[]>
  ) {
    const directory = await mkdtemp(join(tmpdir(), "arconis-delivery-search-"));
    const path = join(directory, "sections.sqlite");
    let db: DatabaseSync | undefined;
    try {
      const object = `search/${revision}.sqlite`;
      const saved = await this.storage.hasObject(user, project, object);
      if (saved) await writeFile(path, await this.storage.readObject(user, project, object));
      db = await openSearchIndex(path, saved);
      if (!saved) {
        buildSearchIndex(db, await load());
        await this.storage.writeObject(user, project, object, await readFile(path));
      }
      return { db, directory };
    } catch (error) {
      db?.close();
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

async function dispose(index: Index) {
  index.db.close();
  await rm(index.directory, { recursive: true, force: true });
}
