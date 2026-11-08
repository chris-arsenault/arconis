import { useEffect, useRef, useState } from "react";
import type { EditorController } from "../editor/controller";
import {
  GROUP_TITLES,
  availableCommands,
  commandContext,
  commandLabel,
  recentCommands,
  runCommand,
  showPalette,
  type Command,
  type CommandContext,
} from "../editor/registry";
import { searchCommands } from "../editor/paletteSearch";
import { shortcutLabel } from "../editor/shortcuts";

function PaletteList({
  commands,
  current,
  context,
  onHover,
  onRun,
  listRef,
}: Readonly<{
  commands: Command[];
  current: number;
  context: CommandContext;
  onHover: (index: number) => void;
  onRun: (command: Command) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
}>) {
  return (
    <ul ref={listRef} role="listbox" aria-label="Commands">
      {commands.map((command, index) => (
        <li key={command.id} role="option" aria-selected={index === current} data-index={index}>
          <button
            type="button"
            tabIndex={-1}
            className={index === current ? "active" : ""}
            onPointerMove={() => onHover(index)}
            onClick={() => onRun(command)}
          >
            <span className="palette-group">{GROUP_TITLES[command.group]}</span>
            <span className="palette-label">{commandLabel(command, context)}</span>
            {command.shortcuts?.[0] && (
              <kbd className="palette-shortcut">{shortcutLabel(command.shortcuts[0])}</kbd>
            )}
          </button>
        </li>
      ))}
      {!commands.length && <li className="palette-empty">No command matches</li>}
    </ul>
  );
}

/**
 * Every command that applies now, found by typing, with its shortcut beside it. It doubles as
 * the shortcut sheet: open it with nothing typed to read them all.
 */
export function CommandPalette({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const context = commandContext(editor);
  const commands = searchCommands(
    availableCommands(context).filter((command) => command.id !== "view.palette"),
    recentCommands(),
    query,
    context
  );
  const close = () => showPalette(editor, false);
  const run = (command: Command) => {
    showPalette(editor, false);
    runCommand(editor, command.id);
  };
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const count = Math.max(1, commands.length);
  const current = Math.min(active, count - 1);
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") setActive((current + 1) % count);
    else if (event.key === "ArrowUp") setActive((current - 1 + count) % count);
    else if (event.key === "Enter" && commands[current]) run(commands[current]);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div className="palette-backdrop" onPointerDown={close}>
      <div
        className="command-palette"
        role="dialog"
        aria-label="Command palette"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          aria-label="Search commands"
          placeholder="Type a command"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <PaletteList
          commands={commands}
          current={current}
          context={context}
          onHover={setActive}
          onRun={run}
          listRef={list}
        />
      </div>
    </div>
  );
}
