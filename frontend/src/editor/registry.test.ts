import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutLabel } from "./shortcuts";
import { COMMANDS } from "./commandTable";
import { commandForKey, isAvailable, type CommandContext } from "./registry";
import { searchCommands } from "./paletteSearch";
import { CanvasDocument } from "../document/canvasDocument";
import type { Item } from "../document/types";
import type { EditorController } from "./controller";
import { EMPTY_FILTER } from "./filter";

function key(init: Partial<KeyboardEvent> & { key: string; code?: string }) {
  return {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

/** A context over a document with no graph; commands' availability needs only the selection. */
function context(selected: Item[] = [], document = new CanvasDocument()): CommandContext {
  return {
    editor: {
      document,
      grid: { visible: false },
      referencesVisible: false,
      history: { canGoBack: () => false, canGoForward: () => false },
      filter: EMPTY_FILTER,
      ui: { palette: false, find: false, filter: false, pasteAs: null },
      focus: null,
      room: null,
    } as unknown as EditorController,
    selected,
    items: document.list(),
  };
}

describe("shortcuts", () => {
  it("matches keys with exactly their modifiers, digits by code too", () => {
    expect(matchesShortcut({ key: "d", ctrl: true }, key({ key: "d", ctrlKey: true }))).toBe(true);
    expect(matchesShortcut({ key: "d", ctrl: true }, key({ key: "d", metaKey: true }))).toBe(true);
    expect(matchesShortcut({ key: "d", ctrl: true }, key({ key: "d" }))).toBe(false);
    expect(matchesShortcut({ key: "d" }, key({ key: "d", ctrlKey: true }))).toBe(false);
    expect(matchesShortcut({ key: "enter" }, key({ key: "Enter", altKey: true }))).toBe(false);
    expect(
      matchesShortcut({ key: "1", shift: true }, key({ key: "!", shiftKey: true, code: "Digit1" }))
    ).toBe(true);
  });

  it("reads as people write shortcuts", () => {
    expect(shortcutLabel({ key: "z", ctrl: true, shift: true })).toMatch(/^(Ctrl|⌘) Shift Z$/);
    expect(shortcutLabel({ key: "]" })).toBe("]");
    expect(shortcutLabel({ key: "enter", alt: true })).toMatch(/^(Alt|⌥) Enter$/);
  });
});

describe("the command table", () => {
  it("gives every shortcut one meaning among the commands that can apply together", () => {
    const seen = new Map<string, string>();
    for (const command of COMMANDS)
      for (const shortcut of command.shortcuts ?? []) {
        const signature = JSON.stringify({
          key: shortcut.key,
          ctrl: Boolean(shortcut.ctrl),
          shift: Boolean(shortcut.shift),
          alt: Boolean(shortcut.alt),
        });
        expect(
          seen.get(signature),
          `${signature} is ${seen.get(signature)} and ${command.id}`
        ).toBeUndefined();
        seen.set(signature, command.id);
      }
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(COMMANDS.length);
  });

  it("finds the command a key asks for only when it applies to the selection", () => {
    const document = new CanvasDocument();
    const a = document.get(document.create("node", 0, 0, { name: "A" }))!;
    const b = document.get(document.create("node", 300, 0, { name: "B" }))!;
    expect(commandForKey(key({ key: "g", ctrlKey: true }), context([a, b], document))?.id).toBe(
      "edit.group"
    );
    expect(commandForKey(key({ key: "g", ctrlKey: true }), context([a], document))).toBeNull();
    expect(commandForKey(key({ key: "Enter" }), context([a], document))?.id).toBe("edit.text");
    expect(commandForKey(key({ key: "Enter", altKey: true }), context([a], document))?.id).toBe(
      "structure.sibling"
    );
    expect(
      commandForKey(key({ key: "Delete" }), context([{ ...a, locked: true }], document))
    ).toBeNull();
    expect(commandForKey(key({ key: "k", ctrlKey: true }), context())?.id).toBe("view.palette");
  });

  it("labels toggles by what they would do next", () => {
    const document = new CanvasDocument();
    const a = document.get(document.create("node", 0, 0))!;
    const lock = COMMANDS.find((command) => command.id === "fields.lock")!;
    const label = (item: Item) =>
      typeof lock.label === "function" ? lock.label(context([item], document)) : lock.label;
    expect(label(a)).toBe("Lock");
    expect(label({ ...a, locked: true })).toBe("Unlock");
    expect(isAvailable(lock, context([], document))).toBe(false);
  });
});

describe("palette search", () => {
  it("ranks label starts first, then words, then letters in order, and lists recent first when empty", () => {
    const current = context();
    const available = COMMANDS.filter((command) => isAvailable(command, current));
    const ids = (query: string, recent = available.slice(0, 0)) =>
      searchCommands(available, recent, query, current).map((command) => command.id);
    expect(ids("zoom")[0]).toBe("view.zoomIn");
    expect(ids("grid")).toContain("view.grid");
    expect(ids("pal")[0]).toBe("view.palette");
    expect(ids("xyzzy")).toEqual([]);
    const recent = [available.find((command) => command.id === "view.grid")].filter(
      (command) => command !== undefined
    );
    expect(ids("", recent)[0]).toBe("view.grid");
  });
});
