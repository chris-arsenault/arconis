import { FLAGS, type Item } from "../document/types";
import { isId } from "../document/ids";
import { BASE_LAYER } from "../document/layers";
import type { Attribute } from "./syntax";
import { quote } from "./printer";

/**
 * The fields every item carries whatever its type: flags, tags, a marker, a task state, a link and
 * who last edited it. Items and lines read and print them the same way.
 */

type FieldKind = "flag" | "tags" | "marker" | "task" | "link" | "edited" | "property";
type FieldAttribute<K extends FieldKind> = Extract<Attribute, { kind: K }>;

export const FIELD_DESCRIBERS: {
  [K in FieldKind]: (item: Item, attribute: FieldAttribute<K>) => void;
} = {
  flag: (item, { flag, value }) => {
    if (value) item[flag] = true;
    else delete item[flag];
  },
  tags: (item, { tags }) => {
    if (tags.length) item.tags = tags;
    else delete item.tags;
  },
  marker: (item, { marker }) => {
    if (marker) item.marker = marker;
    else delete item.marker;
  },
  task: (item, { task }) => {
    if (task) item.task = task;
    else delete item.task;
  },
  link: (item, { link }) => {
    if (link) item.link = link;
    else delete item.link;
  },
  edited: (item, { by, at }) => {
    item.editedBy = by;
    item.editedAt = at;
  },
  property: (item, { key, value }) => {
    const properties = { ...item.properties };
    if (value === undefined) delete properties[key];
    else properties[key] = value;
    if (Object.keys(properties).length) item.properties = properties;
    else delete item.properties;
  },
};

export function isFieldAttribute(attribute: Attribute): attribute is FieldAttribute<FieldKind> {
  return attribute.kind in FIELD_DESCRIBERS;
}

export function describeField(item: Item, attribute: FieldAttribute<FieldKind>) {
  const apply = FIELD_DESCRIBERS[attribute.kind] as (item: Item, attribute: Attribute) => void;
  apply(item, attribute);
}

/** Tags as a person types them: words split on commas and spaces, kept to the characters ids allow. */
export function parseTags(text: string) {
  const tags = text
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ""))
    .filter((tag) => tag && isId(tag));
  return [...new Set(tags)];
}

/** Whether a link is a web address rather than the id of something on the canvas. */
export function isWebLink(link: string) {
  return link.includes(":");
}

/** The field words of an item's statement, in canonical order, after what it is and before its look. */
export function fieldWords(item: Item) {
  const parts: string[] = [...FLAGS.filter((flag) => item[flag]), ...layerWords(item)];
  if (item.scaleContents) parts.push("scale-contents");
  if (item.tags?.length) parts.push("tags", item.tags.join(", "));
  if (item.marker) parts.push("marker", item.marker);
  if (item.task) parts.push("task", item.task);
  if (item.link) parts.push("link", isWebLink(item.link) ? quote(item.link) : item.link);
  for (const [key, value] of Object.entries(item.properties ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  ))
    parts.push("property", key, quote(value));
  return parts;
}

/** Contents are in their holder's layer, so only top-level items outside the base name one. */
function layerWords(item: Item) {
  return !item.inside && item.layer && item.layer !== BASE_LAYER ? ["in-layer", item.layer] : [];
}

/** Who last edited the item, at the end of its statement. */
export function editedWords(item: Item) {
  if (item.editedBy === undefined || item.editedAt === undefined) return [];
  return ["edited", quote(item.editedBy), "at", String(Math.round(item.editedAt))];
}
