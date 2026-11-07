import type { Discussion, DomainItem } from "./model";

/** Each projected field and the word for a change to it. */
const FIELD_WORDS: Record<string, string> = {
  x: "moved",
  y: "moved",
  width: "resized",
  height: "resized",
  name: "renamed",
  look: "restyled",
  extra: "restyled",
  inside: "moved to another holder",
  from: "reconnected",
  to: "reconnected",
  route: "rerouted",
  arrow: "restyled",
  fromPoint: "rerouted",
  toPoint: "rerouted",
  via: "rerouted",
  points: "redrawn",
  stencil: "changed stencil",
  icon: "changed icon",
  frame: "changed frame",
  note: "changed text style",
  picture: "changed picture",
  onLine: "moved to another line",
  screen: "resized",
  type: "changed type",
};

export interface ItemChange {
  id: string;
  change: "added" | "removed" | "changed";
  type: string;
  name: string;
  what?: string[];
  /** The item as it is now, so the reader's picture of it is current. */
  now?: DomainItem;
}
export interface DiscussionChange {
  discussion: string;
  on: string;
  change: "started" | "replied" | "resolved" | "reopened" | "removed";
  comments?: Discussion["comments"];
}

function differences(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const words = new Set<string>();
  keys.forEach((key) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      words.add(FIELD_WORDS[key] ?? "changed");
  });
  return [...words];
}

/** What happened to items between two snapshots of their serialized form. */
export function itemChanges(before: Map<string, string>, after: Map<string, string>) {
  const changes: ItemChange[] = [];
  after.forEach((json, id) => {
    const previous = before.get(id);
    if (previous === json) return;
    const now = JSON.parse(json) as DomainItem;
    const base = { id, type: now.type, name: now.name, now };
    if (previous === undefined) changes.push({ ...base, change: "added" });
    else
      changes.push({
        ...base,
        change: "changed",
        what: differences(
          JSON.parse(previous) as Record<string, unknown>,
          now as unknown as Record<string, unknown>
        ),
      });
  });
  before.forEach((json, id) => {
    if (after.has(id)) return;
    const gone = JSON.parse(json) as DomainItem;
    changes.push({ id, change: "removed", type: gone.type, name: gone.name });
  });
  return changes;
}

export function discussionChanges(before: Map<string, string>, after: Map<string, string>) {
  const changes: DiscussionChange[] = [];
  after.forEach((json, id) => {
    const previous = before.get(id);
    if (previous === json) return;
    const now = JSON.parse(json) as Discussion;
    const old = previous ? (JSON.parse(previous) as Discussion) : null;
    const known = new Set(old?.comments.map((comment) => comment.id));
    const fresh = now.comments.filter((comment) => !known.has(comment.id));
    const base = { discussion: id, on: now.on };
    if (!old) changes.push({ ...base, change: "started", comments: now.comments });
    else if (fresh.length) changes.push({ ...base, change: "replied", comments: fresh });
    if (old && old.resolved !== now.resolved)
      changes.push({ ...base, change: now.resolved ? "resolved" : "reopened" });
  });
  before.forEach((json, id) => {
    if (!after.has(id))
      changes.push({ discussion: id, on: (JSON.parse(json) as Discussion).on, change: "removed" });
  });
  return changes;
}
