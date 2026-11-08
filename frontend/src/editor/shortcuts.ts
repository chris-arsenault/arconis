/**
 * Keyboard shortcuts as the command table declares them. `ctrl` means Ctrl, or Command on a Mac;
 * every shortcut keeps one meaning wherever it applies.
 */
export interface Shortcut {
  /** The key as `KeyboardEvent.key` reports it, in lower case; a digit also matches by its code. */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  enter: "Enter",
  tab: "Tab",
  escape: "Esc",
  delete: "Del",
  backspace: "⌫",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  "=": "+",
};

/** How a shortcut reads beside a command, on this platform. */
export function shortcutLabel({ key, ctrl, shift, alt }: Shortcut) {
  const parts: string[] = [];
  if (ctrl) parts.push(IS_MAC ? "⌘" : "Ctrl");
  if (alt) parts.push(IS_MAC ? "⌥" : "Alt");
  if (shift) parts.push("Shift");
  parts.push(KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key));
  return parts.join(" ");
}

/** Whether a key event is this shortcut, with exactly its modifiers. */
export function matchesShortcut(shortcut: Shortcut, event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier !== Boolean(shortcut.ctrl)) return false;
  if (event.shiftKey !== Boolean(shortcut.shift)) return false;
  if (event.altKey !== Boolean(shortcut.alt)) return false;
  const key = event.key.toLowerCase();
  if (key === shortcut.key) return true;
  // Shift changes what a digit key reports; its code still names the digit.
  const digit = /^Digit(\d)$/.exec(event.code ?? "")?.[1];
  return digit !== undefined && digit === shortcut.key;
}
