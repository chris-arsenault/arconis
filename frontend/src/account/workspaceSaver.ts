import { WorkspaceConflict, type AccountStore } from "./accountStore";
import type { SavedCopy } from "./workspaceFile";

/** Quiet time after an edit before a saved workspace is stored again. */
export const AUTOSAVE_MS = 30_000;

/** The room being saved. */
export interface SaveableRoom {
  id: string;
  title(): string;
  contents(): Promise<SavedCopy>;
  /** Merges a stored copy in. The document is a CRDT, so nothing in either copy is lost. */
  apply(copy: SavedCopy): Promise<void>;
  onChange(listener: () => void): () => void;
}

type Account = Pick<AccountStore, "workspaces" | "save" | "load" | "subscribe">;

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
  private stopAccountWatching: () => void;
  private keepSaved = false;
  private closed = false;

  constructor(
    private account: Account,
    private room: SaveableRoom,
    private changed: () => void
  ) {
    this.stopWatching = room.onChange(() => {
      if (!this.keepSaved) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.save(), AUTOSAVE_MS);
    });
    this.stopAccountWatching = account.subscribe(() => {
      void this.checkRemoved().catch(() => {});
    });
  }

  /** Finds this room's saved copy, if there is one, and brings it in. */
  async attach() {
    const saved = (await this.account.workspaces()).find(({ roomId }) => roomId === this.room.id);
    if (!saved || this.closed) return;
    this.id = saved.id;
    this.keepSaved = true;
    await this.mergeNewer(saved.revision);
    this.changed();
  }

  private async mergeNewer(revision: string) {
    if (revision === this.revision) return;
    const { copy, revision: loaded } = await this.account.load(this.id!);
    await this.room.apply(copy);
    this.revision = loaded;
  }

  /** Stores the room now, starting to keep it saved if it was not already. */
  save() {
    this.keepSaved = true;
    this.saving = this.saving.then(() => this.store());
    return this.saving;
  }

  private async mergeSaved() {
    if (!this.id) return true;
    const saved = (await this.account.workspaces()).find(({ id }) => id === this.id);
    if (!saved) {
      this.forgetSaved();
      return false;
    }
    await this.mergeNewer(saved.revision);
    return true;
  }

  private async checkRemoved() {
    const { id, revision } = this;
    if (!id) return;
    const saved = await this.account.workspaces();
    if (
      !this.closed &&
      this.id === id &&
      this.revision === revision &&
      !saved.some((item) => item.id === id)
    )
      this.forgetSaved();
  }

  private forgetSaved() {
    this.id = null;
    this.revision = "";
    this.keepSaved = false;
    this.error = "";
    this.cancelAutosave();
    this.changed();
  }

  private cancelAutosave() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private get active() {
    return !this.closed && this.keepSaved;
  }

  private async store(retry = true): Promise<void> {
    if (!this.active) return;
    this.cancelAutosave();
    try {
      if (!(await this.mergeSaved()) || !this.active) return;
      await this.publish();
    } catch (error) {
      if (error instanceof WorkspaceConflict && retry && !this.closed) return this.store(false);
      this.error = error instanceof Error ? error.message : "The workspace could not be saved.";
    }
    this.changed();
  }

  private async publish() {
    const id = this.id ?? crypto.randomUUID();
    const expectedRevision = this.revision;
    const contents = await this.room.contents();
    if (!this.active) return;
    const revision = await this.account.save(id, this.room.title(), contents, expectedRevision);
    if (!this.active) return;
    this.id = id;
    this.revision = revision;
    this.error = "";
  }

  close() {
    this.closed = true;
    this.cancelAutosave();
    this.stopWatching();
    this.stopAccountWatching();
  }
}
