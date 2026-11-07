/** Three edits by one person within this window start the relay. */
export const EDIT_WINDOW_MS = 60 * 60_000;
export const EDITS_TO_START = 3;
/** Updates closer together than this are one edit, so a single drag cannot start the relay. */
export const SAME_EDIT_MS = 2000;

/** Counts one person's separate edits, so one accidental change does not start a server. */
export class EditCounter {
  private edits: number[] = [];
  private lastUpdate = Number.NEGATIVE_INFINITY;

  /** Records a document update, and returns true when it completes the required edits. */
  record(now: number) {
    const sameEdit = now - this.lastUpdate < SAME_EDIT_MS;
    this.lastUpdate = now;
    if (sameEdit) return false;
    this.edits = [...this.edits.filter((time) => now - time < EDIT_WINDOW_MS), now];
    if (this.edits.length < EDITS_TO_START) return false;
    this.edits = [];
    return true;
  }
}
