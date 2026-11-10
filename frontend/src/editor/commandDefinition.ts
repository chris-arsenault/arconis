import { completeShortcut } from "./shortcuts";
import type { Command, CommandDefinition } from "./registry";

/** Normalize declarations before any command consumer sees them. Kept outside registry imports. */
export function completeCommand(definition: CommandDefinition): Command {
  return {
    keywords: [],
    when: () => true,
    native: false,
    ...definition,
    shortcuts: (definition.shortcuts ?? []).map(completeShortcut),
  };
}
