export type IndicatorVisibility = "show" | "selected" | "hide";

const KEY = "arconis-canvas-indicators";
const DEFAULT: IndicatorVisibility = "show";
const listeners = new Set<() => void>();
let current: IndicatorVisibility | null = null;

function load(): IndicatorVisibility {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "show" || saved === "selected" || saved === "hide") return saved;
  } catch {
    // The display preference remains usable without browser storage.
  }
  return DEFAULT;
}

/**
 * Where object indicators show: comments, tags, markers, relationships, tasks and locks follow
 * one setting. A local viewing preference never changes the shared canvas or its undo history.
 */
export const displayPreferences = {
  snapshot: () => (current ??= load()),
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(visibility: IndicatorVisibility) {
    current = visibility;
    try {
      localStorage.setItem(KEY, visibility);
    } catch {
      // Keep the current view usable when the preference cannot be saved.
    }
    listeners.forEach((listener) => listener());
  },
};

export function indicatorVisible(visibility: IndicatorVisibility, selected: boolean) {
  return visibility === "show" || (visibility === "selected" && selected);
}
