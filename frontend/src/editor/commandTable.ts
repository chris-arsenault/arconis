import { isBox } from "../document/types";
import type { AlignMode, Axis } from "../document/relations";
import { hasText } from "../document/capabilities";
import { deckOf, isSlide } from "../document/slides";
import type { Command, CommandContext } from "./registry";
import type { Tool } from "./shapes";
import { routeAround } from "./commands";
import {
  addBranch,
  addReference,
  alignSelection,
  distributeSelection,
  tidySelection,
} from "./topics";
import { branchChildren } from "../document/relations";
import { fitText } from "./textLayout";
import { selectAll } from "./locking";
import { copySelection, cutSelection } from "./clipboard";
import { pasteFromClipboard } from "./clipboardInput";
import { FIELD_COMMANDS } from "./fieldCommands";
import { VIEW_COMMANDS } from "./viewCommands";
import { SELECTION_COMMANDS, STYLE_COMMANDS } from "./selectionCommands";
import { STRUCTURE_KEYS } from "./structureCommands";
import { LAYOUT_COMMANDS } from "./layoutCommands";
import { PRESENCE_COMMANDS } from "./presenceCommands";
import { POINTER_COMMANDS } from "./pointerCommands";
import { STENCIL_COMMANDS } from "./stencilCommands";
import { EXPORT_COMMANDS } from "./exportCommands";
import { showRelate } from "./registry";

/** The commands, in the order menus and the palette list them within each group. */

const inRoom = ({ editor }: CommandContext) => editor.room !== null;
const one = ({ selected }: CommandContext) => selected.length === 1;
const some = ({ selected }: CommandContext) => selected.length > 0;
const two = ({ selected }: CommandContext) => selected.length === 2;
const several = ({ selected }: CommandContext) => selected.length > 1;
const boxes = ({ selected }: CommandContext) => selected.filter(isBox);

function tool(id: Tool, label: string, key?: string, keywords: string[] = []): Command {
  return {
    id: `tool.${id}`,
    label,
    group: "tools",
    keywords,
    shortcuts: key ? [{ key }] : undefined,
    run: ({ editor }) => editor.setTool(id),
  };
}

const TOOLS: Command[] = [
  tool("select", "Select", "v"),
  tool("pan", "Pan", "h", ["hand", "move view"]),
  tool("connect", "Connector: click two objects", "c", ["line", "arrow", "link"]),
  tool("draw", "Draw", "p", ["pen", "ink", "content layer"]),
  tool("markup", "Markup", "m", ["annotate", "annotation", "highlighter"]),
];

const CREATE: Command[] = [
  tool("note", "Sticky note", "n"),
  tool("text", "Text", "t"),
  tool("rectangle", "Rectangle", "r"),
  tool("ellipse", "Ellipse", "e", ["circle"]),
  tool("decision", "Decision", "d", ["diamond"]),
  tool("frame", "Frame", "f", ["container"]),
  tool("slide", "Slide", undefined, ["deck"]),
  tool("service", "Service"),
  tool("database", "Database"),
  tool("cloud", "Cloud"),
  tool("person", "Person"),
].map((command) => ({ ...command, group: "create" as const }));

const EDIT: Command[] = [
  {
    id: "edit.undo",
    label: "Undo",
    group: "edit",
    shortcuts: [{ key: "z", ctrl: true }],
    when: ({ editor }) => editor.document.undo.canUndo(),
    run: ({ editor }) => editor.document.undo.undo(),
  },
  {
    id: "edit.redo",
    label: "Redo",
    group: "edit",
    shortcuts: [
      { key: "z", ctrl: true, shift: true },
      { key: "y", ctrl: true },
    ],
    when: ({ editor }) => editor.document.undo.canRedo(),
    run: ({ editor }) => editor.document.undo.redo(),
  },
  {
    id: "edit.text",
    label: "Edit text",
    group: "edit",
    shortcuts: [{ key: "enter" }],
    keywords: ["rename", "label"],
    when: (context) => one(context) && hasText(context.selected[0]) && !context.selected[0].locked,
    run: ({ editor, selected }) => editor.edit(selected[0].id),
  },
  {
    id: "edit.cut",
    label: "Cut",
    group: "edit",
    shortcuts: [{ key: "x", ctrl: true }],
    native: true,
    when: (context) => inRoom(context) && context.selected.some((item) => !item.locked),
    run: ({ editor }) => void cutSelection(editor, editor.room!),
  },
  {
    id: "edit.copy",
    label: "Copy",
    group: "edit",
    shortcuts: [{ key: "c", ctrl: true }],
    native: true,
    when: (context) => inRoom(context) && some(context),
    run: ({ editor }) => void copySelection(editor, editor.room!),
  },
  {
    id: "edit.paste",
    label: "Paste",
    group: "edit",
    shortcuts: [{ key: "v", ctrl: true }],
    native: true,
    when: inRoom,
    run: ({ editor }) => void pasteFromClipboard(editor, editor.room!),
  },
  {
    id: "edit.pasteInPlace",
    label: "Paste in place",
    group: "edit",
    shortcuts: [{ key: "v", ctrl: true, shift: true }],
    native: true,
    keywords: ["same position"],
    when: inRoom,
    run: ({ editor }) => void pasteFromClipboard(editor, editor.room!, { inPlace: true }),
  },
  {
    id: "edit.duplicate",
    label: "Duplicate",
    group: "edit",
    shortcuts: [{ key: "d", ctrl: true }],
    keywords: ["copy"],
    when: some,
    run: ({ editor }) => editor.duplicate(),
  },
  {
    id: "edit.delete",
    label: "Delete",
    group: "edit",
    shortcuts: [{ key: "delete" }, { key: "backspace" }],
    keywords: ["remove"],
    when: ({ selected }) => selected.some((item) => !item.locked),
    run: ({ editor }) => editor.remove(),
  },
  {
    id: "edit.group",
    label: "Group",
    group: "edit",
    shortcuts: [{ key: "g", ctrl: true }],
    when: several,
    run: ({ editor }) => editor.group(),
  },
  {
    id: "edit.ungroup",
    label: "Ungroup",
    group: "edit",
    shortcuts: [{ key: "g", ctrl: true, shift: true }],
    when: ({ selected }) => selected.some((item) => item.type === "group"),
    run: ({ editor }) => editor.ungroup(),
  },
  {
    id: "edit.fitText",
    label: "Fit to text",
    group: "edit",
    keywords: ["resize", "shrink"],
    when: ({ selected }) => selected.some(hasText),
    run: ({ editor, selected }) =>
      selected.filter(hasText).forEach((item) => void fitText(editor.document, item.id)),
  },
  {
    id: "edit.escape",
    label: "Finish editing",
    group: "edit",
    shortcuts: [{ key: "escape" }],
    keywords: ["deselect", "cancel"],
    run: ({ editor }) => editor.clearEditing(),
  },
];

const ALIGN: { mode: AlignMode; label: string }[] = [
  { mode: "left", label: "Align left edges" },
  { mode: "center", label: "Align horizontal centers" },
  { mode: "right", label: "Align right edges" },
  { mode: "top", label: "Align top edges" },
  { mode: "middle", label: "Align vertical centers" },
  { mode: "bottom", label: "Align bottom edges" },
];
const DISTRIBUTE: { axis: Axis; label: string }[] = [
  { axis: "horizontal", label: "Distribute horizontally" },
  { axis: "vertical", label: "Distribute vertically" },
];

const ARRANGE: Command[] = [
  {
    id: "arrange.front",
    label: "Bring to front",
    group: "arrange",
    shortcuts: [{ key: "]" }],
    when: some,
    run: ({ editor }) => editor.stack("front"),
  },
  {
    id: "arrange.back",
    label: "Send to back",
    group: "arrange",
    shortcuts: [{ key: "[" }],
    when: some,
    run: ({ editor }) => editor.stack("back"),
  },
  ...ALIGN.map(({ mode, label }): Command => ({
    id: `arrange.align.${mode}`,
    label,
    group: "arrange",
    when: (context) => boxes(context).length >= 2,
    run: ({ editor }) => alignSelection(editor, mode),
  })),
  ...DISTRIBUTE.map(({ axis, label }): Command => ({
    id: `arrange.distribute.${axis}`,
    label,
    group: "arrange",
    when: (context) => boxes(context).length >= 3,
    run: ({ editor }) => distributeSelection(editor, axis),
  })),
  {
    id: "arrange.route",
    label: "Route around items",
    group: "arrange",
    when: (context) => one(context) && !isBox(context.selected[0]),
    run: ({ editor, selected }) => routeAround(editor.document, selected[0]),
  },
];

const STRUCTURE: Command[] = [
  {
    id: "structure.branch",
    label: "Add branch",
    group: "structure",
    shortcuts: [{ key: "tab" }],
    keywords: ["child", "topic"],
    when: one,
    run: ({ editor }) => addBranch(editor),
  },
  {
    id: "structure.sibling",
    label: "Add sibling",
    group: "structure",
    shortcuts: [{ key: "enter", alt: true }],
    keywords: ["topic"],
    when: one,
    run: ({ editor }) => addBranch(editor, true),
  },
  {
    id: "structure.connect",
    label: "Connect",
    group: "structure",
    keywords: ["line", "arrow"],
    when: two,
    run: ({ editor }) => editor.connect(),
  },
  {
    id: "structure.relate",
    label: (context) => (two(context) ? "Relate these two" : "Relate to…"),
    group: "structure",
    keywords: ["reference", "link", "see also", "mind map"],
    when: (context) => one(context) || two(context),
    run: ({ editor, selected }) =>
      selected.length === 2 ? addReference(editor) : showRelate(editor, true),
  },
  {
    id: "structure.tidy",
    label: "Tidy branches",
    group: "structure",
    keywords: ["layout", "tree"],
    when: (context) =>
      one(context) && branchChildren(context.items, context.selected[0].id).length > 0,
    run: ({ editor }) => tidySelection(editor),
  },
  {
    id: "structure.present",
    label: ({ selected }) => `Present ${isSlide(selected[0]) ? deckOf(selected[0]) : "deck"}`,
    group: "structure",
    keywords: ["slides", "slideshow"],
    when: (context) => one(context) && isSlide(context.selected[0]),
    run: ({ editor, selected }) => editor.presenter.start(deckOf(selected[0]), selected[0].id),
  },
];

const SELECT: Command[] = [
  {
    id: "select.all",
    label: "Select all",
    group: "select",
    shortcuts: [{ key: "a", ctrl: true }],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => selectAll(editor.graph, editor.document),
  },
];

export const COMMANDS: Command[] = [
  ...TOOLS,
  ...CREATE,
  ...EDIT,
  ...STYLE_COMMANDS,
  ...FIELD_COMMANDS,
  ...ARRANGE,
  ...STRUCTURE,
  ...STRUCTURE_KEYS,
  ...LAYOUT_COMMANDS,
  ...SELECT,
  ...SELECTION_COMMANDS,
  ...VIEW_COMMANDS,
  ...PRESENCE_COMMANDS,
  ...POINTER_COMMANDS,
  ...STENCIL_COMMANDS,
  ...EXPORT_COMMANDS,
];
