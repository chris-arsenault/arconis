/** Local user-action lifetime. This is application state, never part of the shared canvas. */
export class CompletedActions {
  private pending = new Set<symbol>();
  private listeners = new Set<() => void>();

  get active() {
    return this.pending.size > 0;
  }

  begin() {
    const token = Symbol("unfinished action");
    this.pending.add(token);
    return () => {
      if (this.pending.delete(token) && !this.active) this.completed();
    };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private completed() {
    this.listeners.forEach((listener) => listener());
  }
}
