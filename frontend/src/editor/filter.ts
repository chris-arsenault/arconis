import { isLink, type Item, type Marker, type TaskState } from "../document/types";

/**
 * A filter over the canvas: items with any of the chosen tags, markers, task states or editors
 * stay bright while the rest dim. Each kind is a choice among its values, and the kinds combine.
 * It is this person's view, not the document's.
 */
export interface Filter {
  tags: string[];
  markers: Marker[];
  tasks: TaskState[];
  authors: string[];
}

export const EMPTY_FILTER: Filter = { tags: [], markers: [], tasks: [], authors: [] };

export function isEmptyFilter(filter: Filter) {
  return (
    !filter.tags.length && !filter.markers.length && !filter.tasks.length && !filter.authors.length
  );
}

/** The values the canvas offers to filter by, each once, in order of first appearance. */
export function filterChoices(items: Item[]) {
  const tags = new Set<string>();
  const markers = new Set<Marker>();
  const tasks = new Set<TaskState>();
  const authors = new Set<string>();
  for (const item of items) {
    item.tags.forEach((tag) => tags.add(tag));
    if (item.marker !== "none") markers.add(item.marker);
    if (item.task !== "none") tasks.add(item.task);
    if (item.editedBy) authors.add(item.editedBy);
  }
  return { tags: [...tags], markers: [...markers], tasks: [...tasks], authors: [...authors] };
}

/** What each kind of the filter reads from an item. */
const VALUES: { [K in keyof Filter]: (item: Item) => string[] } = {
  tags: (item) => item.tags,
  markers: (item) => (item.marker !== "none" ? [item.marker] : []),
  tasks: (item) => (item.task !== "none" ? [item.task] : []),
  authors: (item) => (item.editedBy ? [item.editedBy] : []),
};

/** An item matches when, for every kind with choices, one of its values is chosen. */
function matches(item: Item, filter: Filter) {
  return (Object.keys(VALUES) as (keyof Filter)[]).every((kind) => {
    const chosen: string[] = filter[kind];
    return !chosen.length || VALUES[kind](item).some((value) => chosen.includes(value));
  });
}

/** The items a filter keeps bright, with the lines between any two of them. */
export function filterMatches(items: Item[], filter: Filter) {
  const bright = new Set(
    items.filter((item) => !isLink(item) && matches(item, filter)).map((item) => item.id)
  );
  for (const item of items)
    if (isLink(item) && bright.has(item.from) && bright.has(item.to)) bright.add(item.id);
  for (const item of items) if (item.onLine && bright.has(item.onLine)) bright.add(item.id);
  return bright;
}

/** A filter with one value of one kind turned on or off. */
export function toggled<K extends keyof Filter>(
  filter: Filter,
  kind: K,
  value: Filter[K][number]
): Filter {
  const values = filter[kind] as Filter[K][number][];
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  return { ...filter, [kind]: next };
}
