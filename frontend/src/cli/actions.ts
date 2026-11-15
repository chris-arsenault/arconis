import { canvasOperation, toolResult } from "../agents/operations";
import { FileSession } from "./fileSession";

export class FileActions {
  session: FileSession | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** All transports serialize session mutations; a read cannot race an in-flight commit. */
  call(name: string, input: unknown = {}) {
    return this.enqueue(() => this.perform(name, input));
  }
  private enqueue<T>(work: () => Promise<T>) {
    const pending = this.queue.then(work);
    this.queue = pending.catch(() => {});
    return pending;
  }
  private async perform(name: string, input: unknown) {
    const operation = canvasOperation(name);
    if (operation.session) {
      if (!this.session) throw new Error("Open a file first with open_file or --file.");
      await this.session.checkRevision();
    }
    const value = await operation.run(this.session, input);
    const staged = typeof value === "object" && value !== null && "staged" in value;
    if (operation.mutates && !staged && !toolResult(value).isError) await this.session!.commit();
    return value;
  }
  open(path: string, create = false) {
    return this.enqueue(async () => {
      await this.release();
      this.session = await FileSession.open(path, create);
      return { file: this.session.path, canvas: this.session.describe() };
    });
  }
  close() {
    return this.enqueue(() => this.release());
  }
  private async release() {
    const previous = this.session;
    this.session = null;
    await previous?.close();
  }
}
