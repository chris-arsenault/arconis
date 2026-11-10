import type { CanvasDocument } from "../document/canvasDocument";
import { movedWithContents } from "../document/relations";
import { LOCAL, isBox, isFrame, type Item } from "../document/types";
import { reflowArrangements } from "./arrangements";

/**
 * Stencils made of ordinary items: a table of docked frames, and a task list, a column frame
 * whose members are tasks. Nothing new in the model; agents write the same items.
 */

/** A table cell's size, and the title row's height, in canvas units. */
export const CELL = { width: 220, height: 120 };
const HEADER_HEIGHT = 48;
const TABLE_TAG = "table";
export const TASKS_TAG = "tasks";

function step(document: CanvasDocument, work: () => void) {
  document.undo.stopCapturing();
  document.doc.transact(work, LOCAL);
  document.undo.stopCapturing();
}

/** A table: a group holding one frame per cell, docked edge to edge, the first row a header. */
export function insertTable(
  document: CanvasDocument,
  at: { x: number; y: number },
  rows: number,
  columns: number
) {
  const width = columns * CELL.width;
  const height = HEADER_HEIGHT + (rows - 1) * CELL.height;
  const order = document.nextOrder();
  const group = document.build("group", at.x, at.y, {
    name: "Table",
    width,
    height,
    tags: [TABLE_TAG],
    order,
  });
  const cells: Item[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const header = row === 0;
      cells.push(
        document.build(
          "frame",
          at.x + column * CELL.width,
          at.y + (header ? 0 : HEADER_HEIGHT + (row - 1) * CELL.height),
          {
            name: header ? `Column ${column + 1}` : "",
            width: CELL.width,
            height: header ? HEADER_HEIGHT : CELL.height,
            inside: group.id,
            order: order + 1 + row * columns + column,
            look: header ? { title: "top", bold: true } : { title: "top" },
          }
        )
      );
    }
  step(document, () => {
    document.insert(group);
    cells.forEach((cell) => document.insert(cell));
  });
  return group.id;
}

/** The table a frame belongs to, if it is a table cell. */
export function tableOf(items: Item[], item: Item) {
  const holder = items.find((candidate) => candidate.id === item.inside);
  return holder?.tags.includes(TABLE_TAG) ? holder : null;
}

function tableCells(items: Item[], table: Item) {
  return items.filter((item) => item.inside === table.id && isFrame(item));
}

/** Adds a row of cells below the table's last row, as tall as that row. */
export function addTableRow(document: CanvasDocument, tableId: string) {
  const items = document.list();
  const table = items.find((item) => item.id === tableId);
  if (!table) return;
  const cells = tableCells(items, table);
  const bottom = Math.max(...cells.map((cell) => cell.y + cell.height));
  const last = cells.filter((cell) => Math.abs(cell.y + cell.height - bottom) < 1);
  const height =
    last.length > 1 || cells.length === last.length
      ? CELL.height
      : (last[0]?.height ?? CELL.height);
  step(document, () => {
    last.forEach((cell) =>
      document.insert(
        document.build("frame", cell.x, bottom, {
          width: cell.width,
          height,
          inside: table.id,
          look: { title: "top" },
        })
      )
    );
    document.patch(table.id, { height: bottom + height - table.y });
  });
}

/** Adds a column of cells to the right of the table's last column, as wide as that column. */
export function addTableColumn(document: CanvasDocument, tableId: string) {
  const items = document.list();
  const table = items.find((item) => item.id === tableId);
  if (!table) return;
  const cells = tableCells(items, table);
  const right = Math.max(...cells.map((cell) => cell.x + cell.width));
  const last = cells.filter((cell) => Math.abs(cell.x + cell.width - right) < 1);
  const columns = new Set(cells.map((cell) => Math.round(cell.x))).size;
  const top = Math.min(...cells.map((cell) => cell.y));
  step(document, () => {
    last.forEach((cell) =>
      document.insert(
        document.build("frame", right, cell.y, {
          name: Math.abs(cell.y - top) < 1 ? `Column ${columns + 1}` : "",
          width: cell.width,
          height: cell.height,
          inside: table.id,
          look: { ...cell.look },
        })
      )
    );
    document.patch(table.id, { width: right + (last[0]?.width ?? CELL.width) - table.x });
  });
}

/** A task list: a column frame tagged for tasks, with three open tasks to start from. */
export function insertTaskList(document: CanvasDocument, at: { x: number; y: number }) {
  const frame = document.build("frame", at.x, at.y, {
    name: "Tasks",
    width: 260,
    height: 200,
    tags: [TASKS_TAG],
    arrange: { how: "column", gap: 8, align: "left" },
  });
  const notes = ["First task", "Second task", "Third task"].map((name, index) =>
    document.build("note", at.x + 24, at.y + 40 + index * 60, {
      name,
      width: 212,
      height: 52,
      inside: frame.id,
      task: "open",
      order: frame.order + 1 + index,
    })
  );
  step(document, () => {
    document.insert(frame);
    notes.forEach((note) => document.insert(note));
    reflowArrangements(document);
  });
  return frame.id;
}

/** The task list an item sits in, if it does. */
export function taskListOf(items: Item[], item: Item) {
  const holder = items.find((candidate) => candidate.id === item.inside);
  return holder?.tags.includes(TASKS_TAG) ? holder : null;
}

/** Adds the next task under one, in its list, and returns the new task's id. */
export function addTaskAfter(document: CanvasDocument, id: string) {
  const items = document.list();
  const task = items.find((item) => item.id === id);
  const list = task ? taskListOf(items, task) : null;
  if (!task || !list || !isBox(task)) return "";
  const next = document.build(task.type, task.x, task.y + task.height + 1, {
    name: "",
    width: task.width,
    height: task.height,
    inside: list.id,
    task: "open",
    stencil: task.stencil,
    style: task.style,
    look: { ...task.look },
  });
  step(document, () => {
    // Members below make room, so the new task takes the slot just after this one.
    items
      .filter((item) => item.inside === list.id && isBox(item) && item.y > task.y)
      .forEach((item) =>
        movedWithContents(items, item.id, 0, task.height + 8).forEach(({ id: moved, values }) =>
          document.patch(moved, values)
        )
      );
    document.insert(next);
    reflowArrangements(document);
  });
  return next.id;
}
