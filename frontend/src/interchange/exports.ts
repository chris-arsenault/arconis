import { branchChildren } from "../document/relations";
import { isBox, isLink, type Item } from "../document/types";

/** The canvas written for other tools: a diagram as a Mermaid flowchart, a topic tree as CSV. */

const HOLDERS = new Set(["frame", "group"]);
const BOXES = new Set(["node", "card", "note", "text", "frame", "group"]);
/** Words Mermaid reads as statements, which a node id must not be. */
const RESERVED = new Set(["end", "graph", "flowchart", "subgraph", "style", "class", "click"]);

/** A stencil's brackets in a flowchart; anything unlisted is a plain box. */
const BRACKETS: Record<string, [string, string]> = {
  decision: ["{", "}"],
  database: ["[(", ")]"],
  ellipse: ["((", "))"],
};

function mermaidText(text: string) {
  const oneLine = text.trim().replaceAll('"', "#quot;").split("\n").join("<br/>");
  return `"${oneLine || " "}"`;
}

/** Mermaid ids for canvas ids: word characters only, unique, never a statement word. */
function mermaidIds(items: Item[]) {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const item of items) {
    const word = item.id.split(/\W+/).filter(Boolean).join("_") || "n";
    const base = RESERVED.has(word.toLowerCase()) || /^\d/.test(word) ? `n_${word}` : word;
    let id = base;
    let count = 1;
    while (used.has(id)) {
      count += 1;
      id = `${base}_${count}`;
    }
    used.add(id);
    ids.set(item.id, id);
  }
  return ids;
}

function arrowOf(line: Item) {
  const dashed = line.look.dashed === true || line.type === "reference";
  const end = line.look.arrow !== "none" && line.type !== "branch";
  const start = (line.look.startArrow ?? "none") !== "none";
  if (dashed) return end ? "-.->" : "-.-";
  if (start && end) return "<-->";
  return end ? "-->" : "---";
}

/** Wide diagrams read left to right, tall ones top down. */
function directionOf(boxes: Item[]) {
  const xs = boxes.flatMap((box) => [box.x, box.x + box.width]);
  const ys = boxes.flatMap((box) => [box.y, box.y + box.height]);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  return wide ? "LR" : "TD";
}

/**
 * The chosen items, or the whole canvas when none are chosen, as a Mermaid flowchart: boxes with
 * their text, frames and groups as subgraphs, and the lines among them. Returns "" when there is
 * no box to write.
 */
export function diagramAsMermaid(items: Item[], ids: string[] = []) {
  const chosen = new Set(ids.length ? ids : items.map((item) => item.id));
  const boxes = items.filter(
    (item) => chosen.has(item.id) && isBox(item) && BOXES.has(item.type) && !item.onLine
  );
  if (!boxes.length) return "";
  const names = mermaidIds(boxes);
  const written = new Set(boxes.map((box) => box.id));
  const holds = (id: string) => boxes.some((box) => box.inside === id);
  const lines = [`flowchart ${directionOf(boxes)}`];
  const write = (parent: string, indent: string) => {
    for (const box of boxes.filter(
      (candidate) => (written.has(candidate.inside) ? candidate.inside : "") === parent
    )) {
      const name = names.get(box.id)!;
      if (HOLDERS.has(box.type) && holds(box.id)) {
        lines.push(`${indent}subgraph ${name}[${mermaidText(box.name)}]`);
        write(box.id, `${indent}  `);
        lines.push(`${indent}end`);
        continue;
      }
      const [open, close] = BRACKETS[box.stencil] ?? ["[", "]"];
      lines.push(`${indent}${name}${open}${mermaidText(box.name)}${close}`);
    }
  };
  write("", "  ");
  for (const line of items.filter(isLink)) {
    const from = names.get(line.from);
    const to = names.get(line.to);
    if (!from || !to || !chosen.has(line.id)) continue;
    const label = line.name.trim() ? `|${mermaidText(line.name)}|` : "";
    lines.push(`  ${from} ${arrowOf(line)}${label} ${to}`);
  }
  return lines.join("\n");
}

function csvCell(text: string) {
  const needsQuotes = text.includes(",") || text.includes('"') || text.includes("\n");
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A topic tree as CSV that keeps its hierarchy: one row per topic, its text in the column of its
 * level, so a spreadsheet shows the nesting and an outliner can read it back.
 */
export function treeAsCsv(items: Item[], rootId: string) {
  const rows: { depth: number; text: string }[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || seen.has(id)) return;
    seen.add(id);
    rows.push({ depth, text: item.name.split("\n").join(" ").trim() || "Untitled" });
    branchChildren(items, id).forEach((child) => visit(child.id, depth + 1));
  };
  visit(rootId, 0);
  const levels = Math.max(0, ...rows.map((row) => row.depth)) + 1;
  const header = Array.from({ length: levels }, (_unused, level) => `Level ${level + 1}`);
  const body = rows.map((row) =>
    Array.from({ length: levels }, (_unused, level) =>
      level === row.depth ? csvCell(row.text) : ""
    )
  );
  return [header, ...body].map((cells) => cells.join(",")).join("\r\n");
}
