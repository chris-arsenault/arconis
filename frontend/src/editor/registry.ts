import type { Item } from "../document/types";
import type { EditorController } from "./controller";
import { matchesShortcut, type Shortcut } from "./shortcuts";
import { COMMANDS } from "./commandTable";
import { EMPTY_FILTER } from "./filter";
import type { MenuState } from "./ui";

/**
 * One table of commands, read by hotkeys, the property panel's actions, the command palette and
 * the context menu, so each has one label, one shortcut and one rule for when it applies.
 */

export type CommandGroup =
  "tools" | "create" | "edit" | "fields" | "arrange" | "structure" | "select" | "view";

export const GROUP_TITLES: Record<CommandGroup, string> = {
  tools: "Tools",
  create: "Create",
  edit: "Edit",
  fields: "Fields",
  arrange: "Arrange",
  structure: "Structure",
  select: "Select",
  view: "View",
};

export interface CommandContext {
  editor: EditorController;
  selected: Item[];
  items: Item[];
}

export interface Command {
  id: string;
  /** A verb phrase, or a function of the context when it names a toggle's next state. */
  label: string | ((context: CommandContext) => string);
  group: CommandGroup;
  shortcuts?: Shortcut[];
  /** Words people might type into the palette beyond the label. */
  keywords?: string[];
  /** Whether the command applies now; absent means always. */
  when?: (context: CommandContext) => boolean;
  run: (context: CommandContext) => void;
  /** The browser's own event runs it on its shortcut, which is shown but not dispatched here. */
  native?: boolean;
}

const byId = new Map(COMMANDS.map((command) => [command.id, command]));

export function commandContext(editor: EditorController): CommandContext {
  return { editor, selected: editor.selected(), items: editor.document.list() };
}

export function commandLabel(command: Command, context: CommandContext) {
  return typeof command.label === "string" ? command.label : command.label(context);
}

export function isAvailable(command: Command, context: CommandContext) {
  return command.when ? command.when(context) : true;
}

export function findCommand(id: string) {
  const command = byId.get(id);
  if (!command) throw new Error(`No command has the id "${id}".`);
  return command;
}

/** The command a key event asks for, if one applies to the current selection. */
export function commandForKey(event: KeyboardEvent, context: CommandContext) {
  return (
    COMMANDS.find(
      (command) =>
        !command.native &&
        command.shortcuts?.some((shortcut) => matchesShortcut(shortcut, event)) &&
        isAvailable(command, context)
    ) ?? null
  );
}

/** Every command that applies now, in table order. */
export function availableCommands(context: CommandContext) {
  return COMMANDS.filter((command) => isAvailable(command, context));
}

/** The most recently run commands, newest first, for this session of the page. */
const recent: string[] = [];
const RECENT_LIMIT = 3;

export function recentCommands() {
  return recent.map((id) => byId.get(id)).filter((command) => command !== undefined);
}

/** Opens or closes the palette, returning focus to the canvas when it closes. */
export function showPalette(editor: EditorController, open: boolean) {
  editor.ui.palette = open;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Opens or closes find on canvas, returning focus to the canvas when it closes. */
export function showFind(editor: EditorController, open: boolean) {
  editor.ui.find = open;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Opens or closes the filter bar; closing it clears the filter so nothing stays dimmed. */
export function showFilter(editor: EditorController, open: boolean) {
  editor.ui.filter = open;
  if (!open) editor.setFilter(EMPTY_FILTER);
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Opens the ring and menu at a point, or closes them. */
export function openMenu(editor: EditorController, menu: MenuState) {
  editor.ui.menu = menu;
  editor.emit();
}
export function closeMenu(editor: EditorController) {
  if (!editor.ui.menu) return;
  editor.ui.menu = null;
  editor.emit();
}
/** Replaces the ring with one of its sub-rings, such as the fills or the shapes. */
export function openSubRing(editor: EditorController, id: string) {
  if (!editor.ui.menu) return;
  editor.ui.menu.subRing = id;
  editor.ui.menu.wedge = null;
  editor.emit();
}

/** Opens an item's comments in a modal above it, or closes the modal. */
export function showComments(editor: EditorController, id: string | null) {
  editor.ui.comments = id;
  editor.emit();
  if (!id) editor.element.focus({ preventScroll: true });
}

/** Opens or closes the tag editor over the selection. */
export function showTagger(editor: EditorController, open: boolean) {
  editor.ui.tagging = open;
  if (open) editor.ui.relating = false;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Opens or closes the picker that relates the selection to another object. */
export function showRelate(editor: EditorController, open: boolean) {
  editor.ui.relating = open;
  if (open) editor.ui.tagging = false;
  editor.emit();
  if (!open) editor.element.focus({ preventScroll: true });
}

/** Begins capturing notes from a world point, or ends the run. */
export function startCapture(editor: EditorController, at: { x: number; y: number }) {
  editor.ui.capture = { at, ids: [] };
  editor.emit();
}
export function endCapture(editor: EditorController) {
  editor.ui.capture = null;
  editor.emit();
  editor.element.focus({ preventScroll: true });
}

/** Runs a command by id when it applies, and remembers it as recent. */
export function runCommand(editor: EditorController, id: string) {
  const command = findCommand(id);
  const context = commandContext(editor);
  if (!isAvailable(command, context)) return false;
  command.run(context);
  const index = recent.indexOf(id);
  if (index >= 0) recent.splice(index, 1);
  recent.unshift(id);
  recent.length = Math.min(recent.length, RECENT_LIMIT);
  editor.emit();
  return true;
}

export { COMMANDS };
