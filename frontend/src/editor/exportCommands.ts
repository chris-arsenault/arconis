import { branchChildren } from "../document/relations";
import type { Item } from "../document/types";
import { downloadFile } from "../files/download";
import type { Command, CommandContext } from "./registry";
import { renderPng, renderSvgFile } from "./pngExport";
import { treeRootOf } from "./outline";
import { pictureScope } from "./layerView";

/** Taking work out: a PNG to the clipboard, an SVG file, a tree as Markdown. */

/** A tree as an indented Markdown list, the form outlines paste back as a tree. */
export function treeAsMarkdown(items: Item[], rootId: string) {
  const lines: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    const text = item.name.split("\n").join(" ").trim() || "Untitled";
    lines.push(`${"  ".repeat(depth)}- ${text}`);
    branchChildren(items, id).forEach((child) => visit(child.id, depth + 1));
  };
  visit(rootId, 0);
  return lines.join("\n");
}

const inRoom = ({ editor }: CommandContext) => editor.room !== null;
const heads = ({ selected, items }: CommandContext) =>
  selected.length === 1 && branchChildren(items, selected[0].id).length > 0;

async function copyPng({ editor, selected }: CommandContext) {
  const room = editor.room!;
  const ids = pictureScope(
    editor.document,
    editor.layers,
    selected.length ? editor.selectionClosure() : []
  );
  const png = ids && (await renderPng(editor.graph, ids, editor.document.list()));
  if (!png) {
    room.setNotice("Add something to the canvas first.");
    return;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": new Blob([png as BlobPart], { type: "image/png" }) }),
    ]);
    room.setNotice("Picture copied.");
  } catch {
    room.setNotice("The browser would not take a picture onto the clipboard.");
  }
}

async function exportSvg({ editor, selected }: CommandContext) {
  const room = editor.room!;
  const ids = pictureScope(
    editor.document,
    editor.layers,
    selected.length ? editor.selectionClosure() : []
  );
  const svg =
    ids &&
    (await renderSvgFile(editor.graph, ids, editor.document.list(), await room.files.canvas(ids)));
  if (!svg) {
    room.setNotice("Add something to the canvas first.");
    return;
  }
  downloadFile(editor.document, svg, "image/svg+xml", "svg");
}

export const EXPORT_COMMANDS: Command[] = [
  {
    id: "export.copyPng",
    label: ({ selected }) => (selected.length ? "Copy selection as PNG" : "Copy canvas as PNG"),
    help: "Copy a picture of the selection, or of everything you can see, to the clipboard.",
    group: "edit",
    keywords: ["picture", "image", "clipboard", "screenshot"],
    when: (context) => inRoom(context) && context.items.length > 0,
    run: (context) => void copyPng(context),
  },
  {
    id: "export.svg",
    label: ({ selected }) => (selected.length ? "Export selection as SVG" : "Export canvas as SVG"),
    help: "Download the selection, or everything you can see, as a vector picture file.",
    group: "edit",
    keywords: ["vector", "download", "picture"],
    when: (context) => inRoom(context) && context.items.length > 0,
    run: (context) => void exportSvg(context),
  },
  {
    id: "export.markdown",
    label: "Copy tree as Markdown",
    help: "Copy this topic's whole tree to the clipboard as an indented Markdown list.",
    group: "edit",
    keywords: ["outline", "text", "list", "opml"],
    when: heads,
    run: ({ editor, items, selected }) => {
      const text = treeAsMarkdown(items, treeRootOf(items, selected[0].id));
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      editor.room?.setNotice("Tree copied as a Markdown list.");
    },
  },
];
