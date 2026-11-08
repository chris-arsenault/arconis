import { focusClosure } from "../document/relations";
import type { Item } from "../document/types";
import { filterMatches, isEmptyFilter, type Filter } from "./filter";

/**
 * What this person's view keeps bright: a focused item's closure, the filter's matches, or
 * both at once. Null means nothing is dimmed.
 */
export function brightSet(items: Item[], focus: string | null, filter: Filter) {
  const filtering = !isEmptyFilter(filter);
  if (!focus && !filtering) return null;
  const focused = focus ? focusClosure(items, focus) : null;
  const matched = filtering ? filterMatches(items, filter) : null;
  if (focused && matched) return new Set([...focused].filter((id) => matched.has(id)));
  return focused ?? matched;
}
