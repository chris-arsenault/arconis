import type { EditorController } from "../editor/controller";
import { commandContext, findCommand, isAvailable, runCommand } from "../editor/registry";

const GROUPS = [
  { title: "Order", ids: ["arrange.front", "arrange.back"] },
  { title: "Group", ids: ["edit.group", "edit.ungroup", "arrange.fitFrame"] },
];

/** Arrangement commands live beside dimensions and alignment, with their usual availability. */
export function ArrangeActions({ editor }: Readonly<{ editor: EditorController }>) {
  const context = commandContext(editor);
  return GROUPS.map(({ title, ids }) => {
    const available = ids.filter((id) => isAvailable(findCommand(id), context));
    if (!available.length) return null;
    return (
      <section key={title} className="inspector-command-group" aria-label={title}>
        <h3>{title}</h3>
        <div>
          {available.map((id) => {
            const command = findCommand(id);
            return (
              <button
                key={id}
                data-hint-detail={command.help}
                onClick={() => runCommand(editor, id)}
              >
                {typeof command.label === "string" ? command.label : command.label(context)}
              </button>
            );
          })}
        </div>
      </section>
    );
  });
}
