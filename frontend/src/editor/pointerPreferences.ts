const KEY = "arconis-context-wheel";
const listeners = new Set<() => void>();
let enabled: boolean | null = null;

function load() {
  try {
    return localStorage.getItem(KEY) === "enabled";
  } catch {
    return false;
  }
}

/** Right-drag pans unless this viewer enables the context wheel on this device. */
export const contextWheelPreference = {
  snapshot: () => (enabled ??= load()),
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(next: boolean) {
    enabled = next;
    try {
      localStorage.setItem(KEY, next ? "enabled" : "disabled");
    } catch {
      // The choice still applies for this visit without browser storage.
    }
    listeners.forEach((listener) => listener());
  },
};
