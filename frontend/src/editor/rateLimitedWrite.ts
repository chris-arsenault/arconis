/** Runs the latest scheduled write at most once per interval, and on flush. */
export class RateLimitedWrite {
  private pending: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private intervalMs: number) {}

  schedule(write: () => void) {
    this.pending = write;
    const wait = this.last + this.intervalMs - performance.now();
    if (wait <= 0) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), wait);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.last = performance.now();
    this.pending?.();
    this.pending = null;
  }
}
