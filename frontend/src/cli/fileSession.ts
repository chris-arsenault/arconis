import { open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { CanvasDocument } from "../document/canvasDocument";
import { LanguageSession, type ReadRequest } from "../language/session";
import { CanvasFiles } from "../files/canvasFiles";
import { sha256 } from "../document/pictures";
import type { CanvasTarget } from "../agents/operations";

/** A foreground file session: no network, account, MCP registration or background process. */
export class FileSession implements CanvasTarget {
  readonly document = new CanvasDocument();
  private domain: LanguageSession | null = null;
  private lifetime = new AbortController();
  private pictures = new Map<string, { bytes: Uint8Array; type: string }>();
  private files = new CanvasFiles(
    this.document,
    {
      add: async (bytes, type) => {
        const { hex } = await sha256(bytes);
        this.pictures.set(hex, { bytes, type });
        return hex;
      },
      readOpen: (hash) => Promise.resolve(this.pictures.get(hash) ?? null),
    },
    this.lifetime.signal,
    () => {}
  );
  private original: string | null = null;
  private failed = false;
  private mode = 0o600;

  private constructor(readonly path: string) {}

  static async open(path: string, create = false) {
    if (!path.endsWith(".arconis")) throw new Error("Choose a .arconis file for local editing.");
    const absolute = await realpath(path).catch((error: unknown) => {
      if (create && isMissing(error)) return resolve(path);
      throw error;
    });
    const lock = await open(`${absolute}.lock`, "wx").catch((error: unknown) => {
      if (hasCode(error, "EEXIST"))
        throw new Error(
          "This file has an active Arconis session (.lock). Close it before reopening. After a crash, remove the stale lock only when no session is running."
        );
      throw error;
    });
    await lock.close();
    const session = new FileSession(absolute);
    try {
      session.original = await session.current();
      if (session.original === null && !create)
        throw new Error("File does not exist; use --create.");
      if (session.original !== null) {
        session.mode = (await stat(absolute)).mode & 0o777;
        await session.files.import(new File([session.original], "canvas.arconis"));
      }
      session.document.undo.clear();
      session.domain = new LanguageSession(session.document, "CLI (agent)");
      return session;
    } catch (error) {
      await session.close();
      throw error;
    }
  }

  private require() {
    if (this.failed || !this.domain)
      throw new Error("Reopen this file session; its previous operation did not commit.");
    return this.domain;
  }
  describe() {
    return this.require().describe();
  }
  read(request: ReadRequest) {
    return this.require().read(request);
  }
  checkLayout(request: ReadRequest) {
    return this.require().checkLayout(request);
  }
  write(statements: string) {
    return this.require().write(statements);
  }
  undo() {
    return this.require().undoLast();
  }
  async importDocument(content: string) {
    const domain = this.require();
    let result = "";
    await this.files.import(new File([content], "canvas.arconis"), domain.origin, (write) => {
      const imported = domain.importDocument(write);
      result = imported.result;
      return imported.created;
    });
    return result;
  }
  exportDocument(ids: string[], includeMarkup: boolean) {
    this.require();
    return this.files.canvas(ids, includeMarkup);
  }

  async checkRevision() {
    this.require();
    if ((await this.current()) !== this.original) {
      this.failed = true;
      throw new Error(
        "The .arconis file changed outside this session. Nothing was written; close and reopen it before editing."
      );
    }
  }

  async commit() {
    const temporary = `${this.path}.${crypto.randomUUID()}.tmp`;
    try {
      const content = await this.files.canvas();
      const handle = await open(temporary, "wx", this.mode);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.checkRevision();
      await rename(temporary, this.path);
      this.original = content;
    } catch (error) {
      this.failed = true;
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async current() {
    return readFile(this.path, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
  }
  async close() {
    this.lifetime.abort();
    this.domain?.destroy();
    this.domain = null;
    this.document.destroy();
    await rm(`${this.path}.lock`, { force: true });
  }
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}
function isMissing(error: unknown) {
  return hasCode(error, "ENOENT");
}
