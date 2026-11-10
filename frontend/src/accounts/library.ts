import { z } from "zod";
import { librarySaveSchema, type LibraryEntry, type LibraryReply } from "../protocol/library";
import type { AccountServices } from "./api";

export interface LibraryTable {
  library(user: string): Promise<LibraryEntry[]>;
  libraryEntry(user: string, id: string): Promise<LibraryEntry | null>;
  renameLibrary(user: string, entry: LibraryEntry): Promise<boolean>;
  createLibrary(
    user: string,
    entry: LibraryEntry
  ): Promise<"saved" | "conflict" | "full" | "deleting">;
  deleteLibrary(user: string, entry: LibraryEntry): Promise<boolean>;
}
const object = (entry: Pick<LibraryEntry, "id" | "revision">) =>
  `sections/${entry.id}/${entry.revision}`;
const invalid = (error: string): LibraryReply => ({ status: 400, body: { error } });
const missing: LibraryReply = { status: 404, body: { error: "This layout no longer exists." } };
const full: LibraryReply = { status: 409, body: { error: "This account's storage is full." } };

export class LibraryApi {
  constructor(
    private table: LibraryTable,
    private services: AccountServices
  ) {}

  async handle(user: string, method: string, path: string, body: unknown): Promise<LibraryReply> {
    if (path === "api/library" && method === "GET")
      return { status: 200, body: { entries: await this.table.library(user) } };
    const match = /^api\/library\/([0-9a-f-]{36})(\/name)?$/.exec(path);
    if (!match || !z.uuid().safeParse(match[1]).success) return missing;
    const [, id, rename] = match;
    if (rename) return method === "PUT" ? this.rename(user, id, body) : missing;
    if (method === "PUT") return this.prepare(user, id, body);
    if (method === "POST") return this.publish(user, id, body);
    return this.entry(user, method, id);
  }

  private async entry(user: string, method: string, id: string): Promise<LibraryReply> {
    const entry = await this.table.libraryEntry(user, id);
    if (!entry) return missing;
    if (method === "DELETE") {
      return (await this.remove(user, entry)) ? { status: 200, body: {} } : missing;
    }
    if (method === "GET")
      return {
        status: 200,
        body: {
          url: await this.services.signDownload(user, object(entry)),
          revision: entry.revision,
        },
      };
    return missing;
  }

  private async prepare(user: string, id: string, body: unknown): Promise<LibraryReply> {
    const parsed = librarySaveSchema.safeParse(body);
    if (!parsed.success) return invalid("A layout needs a name and valid canvas file.");
    const revision = this.services.newRevision();
    const url = await this.services.signUpload(
      user,
      object({ id, revision }),
      parsed.data.size,
      parsed.data.checksum
    );
    return { status: 200, body: { url, revision } };
  }

  private async publish(user: string, id: string, body: unknown): Promise<LibraryReply> {
    const parsed = librarySaveSchema.extend({ revision: z.uuid() }).safeParse(body);
    if (!parsed.success) return invalid("The uploaded layout is not valid.");
    const entry: LibraryEntry = { id, ...parsed.data, updated: this.services.now() };
    const stored = await this.services.objectInfo(user, object(entry));
    if (stored?.size !== entry.size || stored.checksum !== entry.checksum)
      return invalid("The layout upload is incomplete or damaged.");
    const previous = await this.table.libraryEntry(user, id);
    if (previous)
      return {
        status: 409,
        body: { error: "This layout already exists. Save a new layout instead." },
      };
    const result = await this.table.createLibrary(user, entry);
    if (result === "full") return full;
    if (result === "deleting")
      return {
        status: 409,
        body: { error: "This account is being deleted.", code: "account_deleting" },
      };
    if (result === "conflict")
      return { status: 409, body: { error: "This layout was saved by another request." } };
    return { status: 200, body: { entry } };
  }

  private async rename(user: string, id: string, body: unknown): Promise<LibraryReply> {
    const parsed = z.object({ name: z.string().trim().min(1).max(200) }).safeParse(body);
    if (!parsed.success) return invalid("A layout needs a name.");
    const entry = await this.table.libraryEntry(user, id);
    if (!entry) return missing;
    const next = { ...entry, name: parsed.data.name };
    if (!(await this.table.renameLibrary(user, next))) return missing;
    return { status: 200, body: { entry: next } };
  }

  private async remove(user: string, entry: LibraryEntry) {
    if (!(await this.table.deleteLibrary(user, entry))) return false;
    await this.services.deleteObject(user, object(entry));
    return true;
  }

  async deleteAll(user: string) {
    for (const entry of await this.table.library(user)) await this.remove(user, entry);
  }
}
