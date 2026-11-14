import { BringToFront, Group, SendToBack, Shrink, Ungroup, type LucideIcon } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { commandContext, findCommand, isAvailable, runCommand } from "../editor/registry";

const ICONS: Record<string, LucideIcon> = {
  "arrange.front": BringToFront,
  "arrange.back": SendToBack,
  "edit.group": Group,
  "edit.ungroup": Ungroup,
  "arrange.fitFrame": Shrink,
};

/** Order and grouping as icons, named by their tooltips; only the commands that apply are shown. */
export function ArrangeActions({ editor }: Readonly<{ editor: EditorController }>) {
  const context = commandContext(editor);
  return Object.entries(ICONS)
    .filter(([id]) => isAvailable(findCommand(id), context))
    .map(([id, Icon]) => {
      const command = findCommand(id);
      const label = typeof command.label === "string" ? command.label : command.label(context);
      return (
        <button
          key={id}
          className="icon-action"
          aria-label={label}
          data-hint={label}
          data-hint-detail={command.help}
          onClick={() => runCommand(editor, id)}
        >
          <Icon size={15} />
        </button>
      );
    });
}
