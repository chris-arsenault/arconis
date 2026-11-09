import { useState } from "react";

function stored(key: string): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Which sections of a panel are open, remembered on this device under `key` so the panel stays
 * as it was left: the rail and the property panel each keep their own.
 */
export function useRailSections(defaults: Record<string, boolean>, key = "arconis.rail") {
  const [open, setOpen] = useState(() => ({ ...defaults, ...stored(key) }));
  const toggle = (id: string, value: boolean) =>
    setOpen((current) => {
      if (current[id] === value) return current;
      const next = { ...current, [id]: value };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* The choice still holds for this page when local preferences are unavailable. */
      }
      return next;
    });
  return { open, toggle };
}
