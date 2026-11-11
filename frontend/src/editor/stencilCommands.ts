import type { CommandDefinition as Command, CommandContext } from "./registry";
import { addTaskAfter, insertTaskList, taskListOf } from "./stencils";
import { pastePoint } from "./clipboard";

/** Inserting and growing the stencil built from ordinary items: the task list. */

function at({ editor }: CommandContext) {
  return editor.ui.menu?.world ?? pastePoint(editor);
}

export const STENCIL_COMMANDS: Command[] = [
  {
    id: "create.taskList",
    label: "Insert a task list",
    help: "Place a column frame for tasks with three open tasks to start from.",
    group: "create",
    keywords: ["todo", "checklist"],
    run: (context) => {
      const id = insertTaskList(context.editor.document, at(context));
      context.editor.select(id);
    },
  },
  {
    id: "tasks.addAfter",
    label: "Add a task below",
    help: "Add the next task under this one in its list, and start typing in it.",
    group: "create",
    keywords: ["next task", "checklist"],
    when: ({ selected, items }) => selected.length === 1 && taskListOf(items, selected[0]) !== null,
    run: ({ editor, selected }) => {
      const id = addTaskAfter(editor.document, selected[0].id);
      if (id) {
        editor.select(id);
        editor.edit(id, true);
      }
    },
  },
];
