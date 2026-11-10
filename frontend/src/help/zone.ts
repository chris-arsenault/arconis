/**
 * What the help zone shows: the control most recently pointed at, focused or held, its name,
 * one sentence about it, and the guide topic of the area it sits in.
 */
export type Help = { anchor: Element; label: string; detail: string; topic: string };

export const HELP_DETAIL_ID = "help-zone-detail";

const listeners = new Set<() => void>();
let current: Help | null = null;

function same(a: Help | null, b: Help | null) {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.anchor === b.anchor &&
      a.label === b.label &&
      a.detail === b.detail &&
      a.topic === b.topic)
  );
}

export const helpZone = {
  snapshot: () => current,
  subscribe(this: void, listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  publish(help: Help | null) {
    if (same(help, current)) return;
    current = help;
    listeners.forEach((listener) => listener());
  },
};
