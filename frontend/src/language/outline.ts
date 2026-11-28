import type { CanvasDocument } from "../document/canvasDocument";
import { layerRoots } from "../document/layerCommands";
import { isLink, type Item } from "../document/types";
import { quote } from "./printer";
const OUTLINE_ARROWS: Partial<Record<Item["type"], string>> = { branch: "=>", reference: "..>" };

/** The content layers bottom to top, each with how many top-level items it has. */
export function layerSummary(document: CanvasDocument, items: Item[]) {
  const layers = document
    .layerList()
    .map((layer) => `${layer.id} ${quote(layer.name)} (${layerRoots(items, layer.id).length})`);
  return `// Layers, bottom to top, beneath markup: ${layers.join(", ")}`;
}

/** A slide in a deck listing: its number, id and name. */
export function slideSummary(slide: Item) {
  const parts = [String(slide.slide), slide.id];
  if (slide.name) parts.push(quote(slide.name));
  return parts.join(" ");
}

export function outline(items: Item[]) {
  const present = new Set(items.map((item) => item.id));
  const lines: string[] = [];
  const children = new Map<string, Item[]>();
  for (const item of items.filter((candidate) => !isLink(candidate))) {
    const holder = present.has(item.inside) ? item.inside : "";
    children.set(holder, [...(children.get(holder) ?? []), item]);
  }
  const visit = (item: Item, depth: number) => {
    const held = children.get(item.id) ?? [];
    const name = item.name ? ` ${quote(item.name)}` : "";
    lines.push(`${"  ".repeat(depth)}${item.type} ${item.id}${name}${held.length ? " {" : ""}`);
    held.forEach((child) => visit(child, depth + 1));
    if (held.length) lines.push(`${"  ".repeat(depth)}}`);
  };
  (children.get("") ?? []).forEach((item) => visit(item, 0));
  for (const item of items.filter(isLink)) {
    const label = item.name ? ` ${quote(item.name)}` : "";
    lines.push(
      `${item.from} ${OUTLINE_ARROWS[item.type] ?? "->"} ${item.to}${label} as ${item.id}`
    );
  }
  return lines;
}
