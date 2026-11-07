import type { AccountStore } from "./accountStore";
import type { WorkspaceContents } from "./workspaceFile";

/** Quiet time after an edit before a saved workspace is stored again. */
export const AUTOSAVE_MS = 30_000;

/** The room being saved. */
export interface SaveableRoom {
  id: string;
  title(): string;
  contents(): Promise<WorkspaceContents>;
  /** Merges a stored copy in. The document is a CRDT, so nothing in either copy is lost. */
  apply(contents: WorkspaceContents): Promise<void>;
  onChange(listener: () => void): () => void;
}

type Account = Pick<AccountStore, "workspaces" | "save" | "load">;

/**
 * Keeps one room's saved copy current once a person has chosen to save it. Another device may have
 * saved since, so a save first merges any newer copy, which keeps both devices' work.
 */
export class WorkspaceSaver {
  id: string | null = null;
  error = "";
  private revision = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving = Promise.resolve();
  private stopWatching: () => void;
  private closed = false;

  constructor(
    private account: Account,
    private room: SaveableRoom,
    private changed: () => void
  ) {
    this.stopWatching = room.onChange(() => {
      if (!this.id) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.save(), AUTOSAVE_MS);
    });
  }

  /** Finds this room's saved copy, if there is one, and brings it in. */
  async attach() {
    const saved = (await this.account.workspaces()).find(({ roomId }) => roomId === this.room.id);
    if (!saved || this.closed) return;
    this.id = saved.id;
    await this.mergeNewer(saved.revision);
    this.changed();
  }

  private async mergeNewer(revision: string) {
    if (revision === this.revision) return;
    const { contents, revision: loaded } = await this.account.load(this.id!);
    await this.room.apply(contents);
    this.revision = loaded;
  }

  /** Stores the room now, starting to keep it saved if it was not already. */
  save() {
    this.saving = this.saving.then(() => this.store());
    return this.saving;
  }

  private async store() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      if (this.id) {
        const saved = (await this.account.workspaces()).find(({ id }) => id === this.id);
        if (saved) await this.mergeNewer(saved.revision);
      }
      this.id ??= crypto.randomUUID();
      this.revision = await this.account.save(
        this.id,
        this.room.title(),
        await this.room.contents()
      );
      this.error = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "The workspace could not be saved.";
    }
    this.changed();
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.stopWatching();
  }
}
