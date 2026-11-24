import { z } from "zod";
import { append, type Actor, type Project } from "./project";
import {
  ancestors,
  entryEdit,
  kinds,
  lookup,
  newEntry,
  newWork,
  projectWork,
  terminal,
  workEdit,
  type Work,
} from "./work";
import { effectiveContext, reviewedWork } from "./review";
import { linkBasis } from "./fileActions";

export const findItem = (project: Project, target: string) =>
  lookup(orderedItems(project), target, (work) => work.title);

function listItems(project: Project, history = false) {
  return orderedItems(project).flatMap((item, index) =>
    history || !item.retired ? [{ ...item, number: index + 1 }] : []
  );
}
function orderedItems(project: Project) {
  const items = [...projectWork(project.work).items.values()];
  const grouped = new Map<string | null, Work[]>();
  for (const item of items) {
    const siblings = grouped.get(item.parent) ?? [];
    siblings.push(item);
    grouped.set(item.parent, siblings);
  }
  const stack = (grouped.get(null) ?? []).reverse();
  const listed: Work[] = [];
  while (stack.length) {
    const item = stack.pop()!;
    listed.push(item);
    const children = grouped.get(item.id) ?? [];
    children.sort((a, b) => b.rank - a.rank || b.id.localeCompare(a.id));
    stack.push(...children);
  }
  return listed;
}
function localEntries(project: Project, work: Work) {
  const { items, entries } = projectWork(project.work);
  const chain = [...ancestors(work, items), work];
  return chain.flatMap((owner) =>
    [...entries.values()].filter((entry) => entry.item === owner.id && !entry.retired)
  );
}
function workState(project: Project, item: Work, changes: z.infer<typeof workEdit>) {
  const state = projectWork(project.work).items;
  const after = { ...item, ...changes };
  if (item.id === project.root && after.parent !== null)
    throw new Error("The project root cannot be moved.");
  if (item.id !== project.root && after.parent === null)
    throw new Error("Work must belong to the project tree.");
  ancestors(after, state);
  if (
    changes.status === "completed" &&
    Array.from(state.values()).some((other) => other.parent === item.id && !terminal(other))
  ) {
    throw new Error("Complete or cancel the open child work first.");
  }
  if (
    changes.status === "in_progress" &&
    after.dependsOn.some((id) => state.get(id)?.status !== "completed")
  ) {
    throw new Error("This work still depends on unfinished work.");
  }
}

export const workActions = {
  work_list: {
    schema: z.object({ history: z.boolean().default(false) }),
    read: true,
    run: (p: Project, _: Actor, a: { history: boolean }) => listItems(p, a.history),
  },
  work_read: {
    schema: z.object({ target: z.string(), review: z.boolean().default(false) }),
    read: true,
    run: (p: Project, _: Actor, a: { target: string; review: boolean }) =>
      reviewedWork(p, findItem(p, a.target), a.review),
  },
  work_add: {
    schema: z.object({
      title: z.string().min(1),
      parent: z.string().optional(),
      fields: workEdit.default({}),
      from: z.array(z.string()).default([]),
    }),
    read: false,
    run: (
      p: Project,
      actor: Actor,
      a: { title: string; parent?: string; fields: z.infer<typeof workEdit>; from: string[] }
    ) => {
      const parent = a.parent ? findItem(p, a.parent).id : p.root;
      const siblings = orderedItems(p).filter((work) => work.parent === parent);
      const item = {
        ...newWork(actor.id(), a.title, parent),
        rank: (siblings.at(-1)?.rank ?? 0) + 1,
        ...a.fields,
      };
      workState(p, item, {});
      append(p, actor, { type: "work.add", item });
      linkBasis(p, actor, item.id, a.from);
      return item;
    },
  },
  work_edit: {
    schema: z.object({ target: z.string(), fields: workEdit }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; fields: z.infer<typeof workEdit> }) => {
      const item = findItem(p, a.target);
      const changes = { ...a.fields };
      if (changes.parent) changes.parent = findItem(p, changes.parent).id;
      for (const key of ["dependsOn", "followsUp", "successors", "anchors"] as const) {
        if (changes[key]) changes[key] = changes[key].map((target) => findItem(p, target).id);
      }
      if (changes.basis)
        changes.basis = changes.basis.map(
          (target) => lookup(localEntries(p, item), target, (e) => e.text).id
        );
      workState(p, item, changes);
      return append(p, actor, { type: "work.edit", item: item.id, changes });
    },
  },
  work_move: {
    schema: z.object({ target: z.string(), after: z.string().default("") }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; after: string }) => {
      const item = findItem(p, a.target);
      if (!item.parent) throw new Error("Choose a nested item.");
      const siblings = orderedItems(p).filter(
        (work) => work.parent === item.parent && work.id !== item.id
      );
      const after = a.after ? findItem(p, a.after) : null;
      const index = after ? siblings.findIndex((work) => work.id === after.id) : -1;
      if (after && index < 0) throw new Error("Choose a sibling as the new position.");
      siblings.splice(index + 1, 0, item);
      for (const [rank, child] of siblings.entries()) {
        if (child.rank !== rank)
          append(p, actor, { type: "work.edit", item: child.id, changes: { rank } });
      }
      return { title: item.title, position: index + 2 };
    },
  },
  entry_add: {
    schema: z.object({
      target: z.string(),
      kind: z.enum(kinds),
      text: z.string().min(1),
      fields: entryEdit.default({}),
    }),
    read: false,
    run: (
      p: Project,
      actor: Actor,
      a: {
        target: string;
        kind: (typeof kinds)[number];
        text: string;
        fields: z.infer<typeof entryEdit>;
      }
    ) => {
      const item = findItem(p, a.target);
      const entry = {
        ...newEntry(actor.id(), item.id, a.kind, a.text),
        ...entryRefs(p, item, a.fields),
      };
      if (entry.kind === "boundary" && !entry.attribution)
        throw new Error("A boundary requires its attribution.");
      return append(p, actor, { type: "entry.add", entry });
    },
  },
  entry_edit: {
    schema: z.object({ target: z.string(), entry: z.string(), fields: entryEdit }),
    read: false,
    run: (
      p: Project,
      actor: Actor,
      a: { target: string; entry: string; fields: z.infer<typeof entryEdit> }
    ) => {
      const item = findItem(p, a.target);
      const entry = lookup(localEntries(p, item), a.entry, (e) => e.text);
      if (entry.item !== item.id) throw new Error("Edit this entry at its owning work item.");
      const changes = entryRefs(p, item, a.fields);
      if (
        (changes.kind ?? entry.kind) === "boundary" &&
        !(changes.attribution ?? entry.attribution)
      )
        throw new Error("A boundary requires its attribution.");
      return append(p, actor, { type: "entry.edit", entry: entry.id, changes });
    },
  },
  result_add: {
    schema: z.object({ target: z.string(), observation: z.string().min(1) }),
    read: false,
    run: (p: Project, actor: Actor, a: { target: string; observation: string }) => {
      const item = findItem(p, a.target);
      return append(p, actor, {
        type: "result",
        item: item.id,
        observation: a.observation,
        snapshot: effectiveContext(p, item).snapshot,
      });
    },
  },
  review_add: {
    schema: z.object({
      target: z.string(),
      result: z.string().default("latest"),
      accepted: z.string().default(""),
      remaining: z.string().default(""),
    }),
    read: false,
    run: (
      p: Project,
      actor: Actor,
      a: { target: string; result: string; accepted: string; remaining: string }
    ) => {
      const item = findItem(p, a.target);
      const results = p.work
        .filter((change) => change.type === "result")
        .filter((change) => change.item === item.id);
      const result =
        a.result === "latest"
          ? results.at(-1)
          : lookup(results, a.result, (change) => change.observation);
      if (!result) throw new Error("Record a result to review first.");
      return append(p, actor, {
        type: "review",
        item: item.id,
        result: result.id,
        accepted: a.accepted,
        remaining: a.remaining,
      });
    },
  },
  work_history: {
    schema: z.object({ target: z.string().optional() }),
    read: true,
    run: (p: Project, _: Actor, a: { target?: string }) => history(p, a.target),
  },
};

function entryRefs(project: Project, item: Work, fields: z.infer<typeof entryEdit>) {
  const changes = { ...fields };
  const available = localEntries(project, item);
  const resolve = (input: string) => lookup(available, input, (entry) => entry.text).id;
  for (const name of ["answer", "goal", "illustrates"] as const) {
    if (changes[name]) changes[name] = resolve(changes[name]);
  }
  if (changes.successors) changes.successors = changes.successors.map(resolve);
  return changes;
}
function history(project: Project, target?: string) {
  if (!target) return project.work;
  const item = findItem(project, target);
  const entries = projectWork(project.work).entries;
  return project.work.filter((change) => {
    switch (change.type) {
      case "work.add":
        return change.item.id === item.id;
      case "entry.add":
        return change.entry.item === item.id;
      case "entry.edit":
        return entries.get(change.entry)?.item === item.id;
      case "link.add":
        return [change.link.from, change.link.to].includes(`work:${item.id}`);
      case "link.remove":
        return project.work.some(
          (add) =>
            add.type === "link.add" &&
            add.link.id === change.link &&
            [add.link.from, add.link.to].includes(`work:${item.id}`)
        );
      default:
        return change.item === item.id;
    }
  });
}
