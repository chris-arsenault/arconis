import type { Item } from "../document/types";
import { isId } from "../document/ids";
import type { Attribute } from "./syntax";

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
    item[flag] = value;
  },
  tags: (item, { tags }) => {
    item.tags = tags;
  },
  marker: (item, { marker }) => {
    item.marker = marker;
  },
  task: (item, { task }) => {
    item.task = task;
  },
  link: (item, { link }) => {
    item.link = link;
  },
  edited: (item, { by, at }) => {
    item.editedBy = by;
    item.editedAt = at;
  },
  property: (item, { key, edit }) => {
    const properties = { ...item.properties };
    if (edit.kind === "remove") delete properties[key];
    else properties[key] = edit.value;
    item.properties = properties;
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
