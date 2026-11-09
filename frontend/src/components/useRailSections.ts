import { useState } from "react";

const KEY = "arconis.rail";

function stored(): Record<string, boolean> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Which rail sections are open, remembered on this device so the rail stays as it was left. */
export function useRailSections(defaults: Record<string, boolean>) {
  const [open, setOpen] = useState(() => ({ ...defaults, ...stored() }));
  const toggle = (id: string, value: boolean) =>
    setOpen((current) => {
      if (current[id] === value) return current;
      const next = { ...current, [id]: value };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* The choice still holds for this page when local preferences are unavailable. */
      }
      return next;
    });
  return { open, toggle };
}
