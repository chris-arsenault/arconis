import { useState, useSyncExternalStore } from "react";

/** Respond to live resize without changing the person's desktop panel preferences. */
export function useNarrowLayout() {
  const [query] = useState(() => window.matchMedia("(max-width: 1100px)"));
  return useSyncExternalStore(
    (changed) => {
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => query.matches
  );
}
