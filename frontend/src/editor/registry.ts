import type { Item } from "../document/types";
import type { EditorController } from "./controller";
import { matchesShortcut, type Shortcut } from "./shortcuts";
import { COMMANDS } from "./commandTable";

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
  /** One sentence for the help zone and the reference: what the command does, plainly. */
  help: string;
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
