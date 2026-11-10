import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { HELP_DETAIL_ID, helpZone } from "../help/zone";

const KEY = "arconis-help-zone";
const listeners = new Set<() => void>();
let shown: boolean | null = null;

function load() {
  try {
    return localStorage.getItem(KEY) !== "hidden";
  } catch {
    return true;
  }
}

/** Whether this viewer shows the help zone. A per-device preference, never shared. */
const helpZonePreference = {
  snapshot: () => (shown ??= load()),
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(next: boolean) {
    shown = next;
    try {
      localStorage.setItem(KEY, next ? "shown" : "hidden");
    } catch {
      // The choice still applies for this visit without browser storage.
    }
    listeners.forEach((listener) => listener());
  },
};

/** The Settings choice that shows or hides the help zone on this device. */
export function HelpZoneToggle() {
  const shown = useSyncExternalStore(helpZonePreference.subscribe, helpZonePreference.snapshot);
  return (
    <label data-hint-detail="Show the help zone under the left panel, which explains the control you point at.">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => helpZonePreference.set(event.target.checked)}
      />
      Show help zone
    </label>
  );
}

/**
 * The name of the control under the pointer or focus and one sentence about it. It sits at the
 * foot of an expanded rail; with the rail folded it docks below the header while it has
 * something to say.
 */
export function HelpZone() {
  const help = useSyncExternalStore(helpZone.subscribe, helpZone.snapshot);
  const visible = useSyncExternalStore(helpZonePreference.subscribe, helpZonePreference.snapshot);
  const zone = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // Docked, the zone sits just below the header, whose height follows the window width.
    const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
    zone.current?.style.setProperty("--help-dock-top", `${Math.round(header) + 8}px`);
  });
  if (!visible) return null;
  return (
    <section
      ref={zone}
      className="help-zone"
      aria-label="Help"
      data-help-id="help-zone"
      data-active={Boolean(help)}
    >
      <div className="help-zone-readout">
        {help ? (
          // The control already has this name; drawing it from an attribute keeps it from
          // being read, or found, twice.
          <strong className="help-zone-title" data-label={help.label} aria-hidden="true" />
        ) : (
          <p className="help-zone-idle">Point at or focus any control to see what it does.</p>
        )}
        {/* Always present, so a focused control can be described by it from the first moment. */}
        <p id={HELP_DETAIL_ID} data-testid="help-zone-detail">
          {help?.detail}
        </p>
        {help?.topic && <p className="help-zone-more">Press ? to read more in Help.</p>}
      </div>
    </section>
  );
}
