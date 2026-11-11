import type { CanvasDocument } from "../document/canvasDocument";
import { movedWithContents } from "../document/relations";
import { LOCAL, isBox, type Item } from "../document/types";
import { reflowArrangements } from "./arrangements";

/**
 * A stencil made of ordinary items: a task list, a column frame whose members are tasks.
 * Nothing new in the model; agents write the same items.
 */

export const TASKS_TAG = "tasks";

function step(document: CanvasDocument, work: () => void) {
  document.undo.stopCapturing();
  document.doc.transact(work, LOCAL);
  document.undo.stopCapturing();
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
