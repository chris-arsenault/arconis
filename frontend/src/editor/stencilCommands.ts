import type { CommandDefinition as Command, CommandContext } from "./registry";
import {
  addTableColumn,
  addTableRow,
  addTaskAfter,
  insertTable,
  insertTaskList,
  tableOf,
  taskListOf,
} from "./stencils";
import { pastePoint } from "./clipboard";

/** Inserting and growing the stencils built from ordinary items: tables and task lists. */

function at({ editor }: CommandContext) {
  return editor.ui.menu?.world ?? pastePoint(editor);
}

const inTable = ({ selected, items }: CommandContext) =>
  selected.length === 1 &&
  (tableOf(items, selected[0]) !== null || selected[0].tags.includes("table"));

function tableIdOf({ selected, items }: CommandContext) {
  const [item] = selected;
  return item.tags.includes("table") ? item.id : (tableOf(items, item)?.id ?? "");
}

export const STENCIL_COMMANDS: Command[] = [
  {
    id: "create.table",
    label: "Insert a table",
    help: "Place a three-by-three table of docked frames, its first row a header.",
    group: "create",
    keywords: ["grid", "matrix", "swimlanes", "docked frames"],
    run: (context) => {
      const id = insertTable(context.editor.document, at(context), 3, 3);
      context.editor.select(id);
    },
  },
  {
    id: "table.addRow",
    label: "Add a table row",
    help: "Add a row of cells below the table's last row, as tall as that row.",
    group: "create",
    when: inTable,
    run: (context) => addTableRow(context.editor.document, tableIdOf(context)),
  },
  {
    id: "table.addColumn",
    label: "Add a table column",
    help: "Add a column of cells right of the table's last column, as wide as that column.",
    group: "create",
    when: inTable,
    run: (context) => addTableColumn(context.editor.document, tableIdOf(context)),
  },
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
