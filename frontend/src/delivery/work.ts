import { z } from "zod";

export const statuses = [
  "pending",
  "active",
  "in_progress",
  "paused",
  "blocked",
  "completed",
  "canceled",
  "skipped",
] as const;
export const kinds = [
  "requirement",
  "boundary",
  "principle",
  "assumption",
  "decision",
  "question",
  "hypothesis",
  "example",
] as const;
const text = z.string();
const refs = z.array(z.string());
export const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);
export const path = z
  .string()
  .refine(
    (value) =>
      value
        .split("/")
        .every((part) => /^[\p{L}\p{N}_ -][\p{L}\p{N}_. -]*$/u.test(part) && part.trim() === part),
    "Use a portable project-relative path"
  );
const workFields = {
  title: z.string().min(1),
  summary: text,
  outcome: text,
  next: text,
  technical: text,
  implementation: text,
  acceptance: text,
  status: z.enum(statuses),
  note: text,
  parent: id.nullable(),
  rank: z.number(),
  basis: refs,
  dependsOn: refs,
  followsUp: refs,
  successors: refs,
  anchors: refs,
  retired: z.boolean(),
};
export const workEdit = z.strictObject({ ...workFields, parent: z.string().nullable() }).partial();
export const workSchema = z.strictObject({ id, ...workFields });
export type Work = z.infer<typeof workSchema>;
export function newWork(id: string, title: string, parent: string | null): Work {
  return {
    id,
    title,
    parent,
    rank: 0,
    summary: "",
    outcome: "",
    next: "",
    technical: "",
    implementation: "",
    acceptance: "",
    status: "pending",
    note: "",
    basis: [],
    dependsOn: [],
    followsUp: [],
    successors: [],
    anchors: [],
    retired: false,
  };
}

const entryFields = {
  kind: z.enum(kinds),
  text,
  source: text,
  rationale: text,
  attribution: z.enum(["user_requirement", "user_correction", "agent_proposal"]).nullable(),
  provisional: z.boolean(),
  answer: id.nullable(),
  goal: id.nullable(),
  test: text,
  result: z.enum(["supported", "contradicted", "inconclusive", "set_aside"]).nullable(),
  evidence: text,
  illustrates: id.nullable(),
  generalization: text,
  retired: z.boolean(),
  successors: refs,
};
export const entryEdit = z
  .strictObject({
    ...entryFields,
    answer: z.string().nullable(),
    goal: z.string().nullable(),
    illustrates: z.string().nullable(),
  })
  .partial();
export const entrySchema = z.strictObject({ id, item: id, ...entryFields });
export type Entry = z.infer<typeof entrySchema>;
export function newEntry(id: string, item: string, kind: Entry["kind"], text: string): Entry {
  return {
    id,
    item,
    kind,
    text,
    source: "",
    rationale: "",
    attribution: null,
    provisional: false,
    answer: null,
    goal: null,
    test: "",
    result: null,
    evidence: "",
    illustrates: null,
    generalization: "",
    retired: false,
    successors: [],
  };
}
export const endpoint = z.string().min(1);
export const relation = z.strictObject({
  id,
  from: endpoint,
  to: endpoint,
  purpose: z.string().min(1),
});
export type Relation = z.infer<typeof relation>;

const stamp = { id, at: z.iso.datetime(), actor: z.string().min(1) };
export const event = z.discriminatedUnion("type", [
  z.strictObject({ ...stamp, type: z.literal("work.add"), item: workSchema }),
  z.strictObject({
    ...stamp,
    type: z.literal("work.edit"),
    item: id,
    changes: z.strictObject(workFields).partial(),
  }),
  z.strictObject({ ...stamp, type: z.literal("entry.add"), entry: entrySchema }),
  z.strictObject({
    ...stamp,
    type: z.literal("entry.edit"),
    entry: id,
    changes: z.strictObject(entryFields).partial(),
  }),
  z.strictObject({
    ...stamp,
    type: z.literal("result"),
    item: id,
    observation: text,
    snapshot: refs,
  }),
  z.strictObject({
    ...stamp,
    type: z.literal("review"),
    item: id,
    result: id,
    accepted: text,
    remaining: text,
  }),
  z.strictObject({ ...stamp, type: z.literal("link.add"), link: relation }),
  z.strictObject({ ...stamp, type: z.literal("link.remove"), link: id }),
]);
export type WorkEvent = z.infer<typeof event>;
export type EventBody<T = WorkEvent> = T extends WorkEvent ? Omit<T, "id" | "at" | "actor"> : never;
export const order = (a: { at: string; id: string }, b: { at: string; id: string }) =>
  a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
export const terminal = (work: Work) =>
  work.status === "completed" ||
  work.status === "canceled" ||
  work.status === "skipped" ||
  work.retired;

export function projectWork(events: WorkEvent[]) {
  const items = new Map<string, Work>();
  const entries = new Map<string, Entry>();
  const links = new Map<string, Relation>();
  for (const change of events) {
    switch (change.type) {
      case "work.add":
        items.set(change.item.id, { ...change.item });
        break;
      case "work.edit":
        Object.assign(items.get(change.item) ?? {}, change.changes);
        break;
      case "entry.add":
        entries.set(change.entry.id, { ...change.entry });
        break;
      case "entry.edit":
        Object.assign(entries.get(change.entry) ?? {}, change.changes);
        break;
      case "link.add":
        links.set(change.link.id, change.link);
        break;
      case "link.remove":
        links.delete(change.link);
        break;
    }
  }
  return { items, entries, links };
}

export function lookup<T extends { id: string }>(
  records: Iterable<T>,
  input: string,
  name: (record: T) => string
) {
  const values = Array.from(records);
  const numbered = /^#([1-9]\d*)$/.exec(input);
  if (numbered && values[Number(numbered[1]) - 1]) return values[Number(numbered[1]) - 1];
  const exact = values.find((record) => record.id === input);
  if (exact) return exact;
  const matches = values.filter((record) => name(record) === input);
  if (matches.length !== 1)
    throw new Error(
      matches.length ? "Ambiguous title. Use the displayed number." : `Unknown target: ${input}`
    );
  return matches[0];
}

export function ancestors(work: Work, items: Map<string, Work>) {
  const chain: Work[] = [];
  const seen = new Set([work.id]);
  let parent = work.parent;
  while (parent) {
    if (seen.has(parent)) throw new Error("Work item hierarchy contains a cycle.");
    seen.add(parent);
    const item = items.get(parent);
    if (!item) throw new Error(`Missing parent work item: ${parent}`);
    chain.unshift(item);
    parent = item.parent;
  }
  return chain;
}
