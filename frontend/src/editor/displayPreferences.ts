export type IndicatorVisibility = "show" | "selected" | "hide";
export type IndicatorType = "comments" | "tags" | "markers" | "relationships" | "status";
export type DisplayPreferences = Record<IndicatorType, IndicatorVisibility>;

const KEY = "arconis-canvas-display";
const DEFAULTS: DisplayPreferences = {
  comments: "show",
  tags: "show",
  markers: "show",
  relationships: "show",
  status: "show",
};
const listeners = new Set<() => void>();
let current: DisplayPreferences | null = null;

function load(): DisplayPreferences {
  const next = { ...DEFAULTS };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") {
      for (const type of Object.keys(next) as IndicatorType[]) {
        const value = (saved as Record<string, unknown>)[type];
        if (value === "show" || value === "selected" || value === "hide") next[type] = value;
      }
    }
  } catch {
    // Display preferences remain usable without browser storage.
  }
  return next;
}

/** Local viewing preferences never change the shared canvas or its undo history. */
export const displayPreferences = {
  snapshot: () => (current ??= load()),
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(type: IndicatorType, visibility: IndicatorVisibility) {
    current = { ...displayPreferences.snapshot(), [type]: visibility };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Keep the current view usable when preferences cannot be saved.
    }
    listeners.forEach((listener) => listener());
  },
};

export function indicatorVisible(visibility: IndicatorVisibility, selected: boolean) {
  return visibility === "show" || (visibility === "selected" && selected);
}
