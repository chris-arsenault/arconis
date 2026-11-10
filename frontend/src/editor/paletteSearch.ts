import type { Command, CommandContext } from "./registry";
import { commandLabel } from "./registry";

/**
 * How the palette ranks commands for what was typed: the label's start first, then a word's
 * start, then the words in order anywhere, then the typed letters in order. Nothing typed lists
 * the recent commands first, then everything available in table order.
 */
function score(text: string, query: string) {
  if (text.startsWith(query)) return 3;
  if (text.split(" ").some((word) => word.startsWith(query))) return 2;
  if (text.includes(query)) return 1;
  let index = 0;
  for (const char of text) if (char === query[index]) index++;
  return index === query.length ? 0.5 : 0;
}

export function searchCommands(
  commands: Command[],
  recent: Command[],
  query: string,
  context: CommandContext
) {
  const typed = query.trim().toLowerCase();
  if (!typed) {
    const recentIds = new Set(recent.map((command) => command.id));
    return [
      ...recent.filter((command) => commands.includes(command)),
      ...commands.filter((command) => !recentIds.has(command.id)),
    ];
  }
  return commands
    .map((command) => {
      const label = commandLabel(command, context).toLowerCase();
      const best = Math.max(
        score(label, typed),
        ...command.keywords.map((keyword) => score(keyword.toLowerCase(), typed) * 0.9)
      );
      return { command, best };
    })
    .filter(({ best }) => best > 0)
    .sort((a, b) => b.best - a.best)
    .map(({ command }) => command);
}
