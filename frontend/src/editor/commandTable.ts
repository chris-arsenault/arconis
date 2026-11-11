import { isBox } from "../document/types";
import type { AlignMode, Axis } from "../document/relations";
import { hasText } from "../document/capabilities";
import { deckOf, isSlide } from "../document/slides";
import { type CommandDefinition as Command, type CommandContext } from "./registry";
import { completeCommand } from "./commandDefinition";
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
import { showRelate } from "./ui";
import { KEEP_TOOL_COMMAND } from "./stickyTool";
import { CLOCK_COMMANDS } from "./clocks";

/** The commands, in the order menus and the palette list them within each group. */

const inRoom = ({ editor }: CommandContext) => editor.room !== null;
const one = ({ selected }: CommandContext) => selected.length === 1;
const some = ({ selected }: CommandContext) => selected.length > 0;
const two = ({ selected }: CommandContext) => selected.length === 2;
const several = ({ selected }: CommandContext) => selected.length > 1;
const boxes = ({ selected }: CommandContext) => selected.filter(isBox);

function tool(
  id: Tool,
  label: string,
  help: string,
  key?: string,
  keywords: string[] = []
): Command {
  return {
    id: `tool.${id}`,
    label,
    help,
    group: "tools",
    keywords,
    shortcuts: key ? [{ key }] : undefined,
    run: ({ editor }) => editor.setTool(id),
  };
}

/** A placing tool: the next click on the canvas puts one down, then Select returns. */
function place(id: Tool, label: string, what: string, key?: string, keywords: string[] = []) {
  return tool(id, label, `Click the canvas to place ${what}.`, key, keywords);
}

const TOOLS: Command[] = [
  tool("select", "Select", "Click or drag on the canvas to select and move objects.", "v"),
  tool(
    "measure",
    "Measure distance",
    "Measure two points in the canvas units; calibrate a known distance.",
    undefined,
    ["ruler", "units", "scale", "distance"]
  ),
  tool("pan", "Pan", "Drag the canvas to move your view instead of objects.", "h", [
    "hand",
    "move view",
  ]),
  tool(
    "connect",
    "Connector: click two objects",
    "Click one object, then another, to join them with a connector that stays attached.",
    "c",
    ["line", "arrow", "link"]
  ),
  tool("draw", "Draw", "Draw ink into the active content layer, where it stays as artwork.", "p", [
    "pen",
    "ink",
    "content layer",
  ]),
  tool(
    "markup",
    "Markup",
    "Draw shared annotations above the workspace, kept apart from its content.",
    "m",
    ["annotate", "annotation", "highlighter"]
  ),
  KEEP_TOOL_COMMAND,
];

const CREATE: Command[] = [
  place("note", "Sticky note", "a sticky note and start typing in it", "n"),
  place("text", "Text", "a text block and start typing in it", "t"),
  place("rectangle", "Rectangle", "a rectangle", "r"),
  place("ellipse", "Ellipse", "an ellipse", "e", ["circle"]),
  place("decision", "Decision", "a diamond for a decision in a flow", "d", ["diamond"]),
  place("frame", "Frame", "a frame that holds the objects dropped into it", "f", ["container"]),
  place("clock", "Clock", "a clock, stopwatch or countdown timer everyone sees", undefined, [
    "timer",
    "stopwatch",
    "countdown",
    "time",
  ]),
  place("slide", "Slide", "a slide, an area of the canvas you can present in a deck", undefined, [
    "deck",
  ]),
  place("service", "Service", "a service node for an architecture diagram"),
  place("database", "Database", "a database node for an architecture diagram"),
  place("cloud", "Cloud", "a cloud node for an architecture diagram"),
  place("person", "Person", "a person node for a user or actor"),
].map((command) => ({ ...command, group: "create" as const }));

const EDIT: Command[] = [
  {
    id: "edit.undo",
    label: "Undo",
    help: "Take back your last change; other people's changes stay.",
    group: "edit",
    shortcuts: [{ key: "z", ctrl: true }],
    when: ({ editor }) => editor.document.undo.canUndo(),
    run: ({ editor }) => editor.document.undo.undo(),
  },
  {
    id: "edit.redo",
    label: "Redo",
    help: "Put back the change you last took back with Undo.",
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
    help: "Open the selected object's label for typing on the canvas.",
    group: "edit",
    shortcuts: [{ key: "enter" }],
    keywords: ["rename", "label"],
    when: (context) => one(context) && hasText(context.selected[0]) && !context.selected[0].locked,
    run: ({ editor, selected }) => editor.edit(selected[0].id),
  },
  {
    id: "edit.cut",
    label: "Cut",
    help: "Copy the selection to the clipboard as canvas text, then delete it.",
    group: "edit",
    shortcuts: [{ key: "x", ctrl: true }],
    native: true,
    when: (context) => inRoom(context) && context.selected.some((item) => !item.locked),
    run: ({ editor }) => void cutSelection(editor, editor.room!),
  },
  {
    id: "edit.copy",
    label: "Copy",
    help: "Copy the selection, what it holds and the lines among it to the clipboard.",
    group: "edit",
    shortcuts: [{ key: "c", ctrl: true }],
    native: true,
    when: (context) => inRoom(context) && some(context),
    run: ({ editor }) => void copySelection(editor, editor.room!),
  },
  {
    id: "edit.paste",
    label: "Paste",
    help: "Paste the clipboard under the pointer, or in the middle of the window.",
    group: "edit",
    shortcuts: [{ key: "v", ctrl: true }],
    native: true,
    when: inRoom,
    run: ({ editor }) => void pasteFromClipboard(editor, editor.room!),
  },
  {
    id: "edit.pasteInPlace",
    label: "Paste in place",
    help: "Paste the clipboard at the positions its objects were copied from.",
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
    help: "Place a copy of the selection and what it holds just beside it, and select the copy.",
    group: "edit",
    shortcuts: [{ key: "d", ctrl: true }],
    keywords: ["copy"],
    when: some,
    run: ({ editor }) => editor.duplicate(),
  },
  {
    id: "edit.delete",
    label: "Delete",
    help: "Remove the selected objects, with what they hold and the lines attached to them.",
    group: "edit",
    shortcuts: [{ key: "delete" }, { key: "backspace" }],
    keywords: ["remove"],
    when: ({ selected }) => selected.some((item) => !item.locked),
    run: ({ editor }) => editor.remove(),
  },
  {
    id: "edit.group",
    label: "Group",
    help: "Put the selected objects in a new group that moves and selects as one.",
    group: "edit",
    shortcuts: [{ key: "g", ctrl: true }],
    when: several,
    run: ({ editor }) => editor.group(),
  },
  {
    id: "edit.ungroup",
    label: "Ungroup",
    help: "Dissolve the selected groups and leave their objects where they are.",
    group: "edit",
    shortcuts: [{ key: "g", ctrl: true, shift: true }],
    when: ({ selected }) => selected.some((item) => item.type === "group"),
    run: ({ editor }) => editor.ungroup(),
  },
  {
    id: "edit.fitText",
    label: "Fit to text",
    help: "Change each selected text box's height so it fits its text exactly.",
    group: "edit",
    keywords: ["resize", "shrink"],
    when: ({ selected }) => selected.some(hasText),
    run: ({ editor, selected }) =>
      selected.filter(hasText).forEach((item) => void fitText(editor.document, item.id)),
  },
  {
    id: "edit.escape",
    label: "Finish editing",
    help: "Close text editing, leave focus, clear the selection and return to Select.",
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
    help: "Stack the selection above everything else on the canvas.",
    group: "arrange",
    shortcuts: [{ key: "]" }],
    when: some,
    run: ({ editor }) => editor.stack("front"),
  },
  {
    id: "arrange.back",
    label: "Send to back",
    help: "Stack the selection beneath everything else on the canvas.",
    group: "arrange",
    shortcuts: [{ key: "[" }],
    when: some,
    run: ({ editor }) => editor.stack("back"),
  },
  ...ALIGN.map(({ mode, label }): Command => ({
    id: `arrange.align.${mode}`,
    label,
    help: "Move the selected objects into line on that edge or centre, carrying what they hold.",
    group: "arrange",
    when: (context) => boxes(context).length >= 2,
    run: ({ editor }) => alignSelection(editor, mode),
  })),
  ...DISTRIBUTE.map(({ axis, label }): Command => ({
    id: `arrange.distribute.${axis}`,
    label,
    help: "Space three or more selected objects evenly along that axis.",
    group: "arrange",
    when: (context) => boxes(context).length >= 3,
    run: ({ editor }) => distributeSelection(editor, axis),
  })),
  {
    id: "arrange.route",
    label: "Route around items",
    help: "Give the selected line a route that avoids the objects and labels between its ends.",
    group: "arrange",
    when: (context) => one(context) && !isBox(context.selected[0]),
    run: ({ editor, selected }) => routeAround(editor.document, selected[0]),
  },
];

const STRUCTURE: Command[] = [
  {
    id: "structure.branch",
    label: "Add branch",
    help: "Grow a new topic out of the selection, joined by a branch, and start typing in it.",
    group: "structure",
    shortcuts: [{ key: "tab" }],
    keywords: ["child", "topic"],
    when: one,
    run: ({ editor }) => addBranch(editor),
  },
  {
    id: "structure.sibling",
    label: "Add sibling",
    help: "Add a topic beside the selection under the same parent, and start typing in it.",
    group: "structure",
    shortcuts: [{ key: "enter", alt: true }],
    keywords: ["topic"],
    when: one,
    run: ({ editor }) => addBranch(editor, true),
  },
  {
    id: "structure.connect",
    label: "Connect",
    help: "Join the two selected objects with a line from the first to the second.",
    group: "structure",
    keywords: ["line", "arrow"],
    when: two,
    run: ({ editor }) => editor.connect(),
  },
  {
    id: "structure.relate",
    label: (context) => (two(context) ? "Relate these two" : "Relate to…"),
    help: "Add a see-also reference, with no line or tree structure, to a picked object or between the two.",
    group: "structure",
    keywords: ["reference", "link", "see also", "mind map"],
    when: (context) => one(context) || two(context),
    run: ({ editor, selected }) =>
      selected.length === 2 ? addReference(editor) : showRelate(editor, true),
  },
  {
    id: "structure.tidy",
    label: "Tidy branches",
    help: "Lay out the selected topic's tree the way it remembers: its direction, spacing and order are set under Relationships.",
    group: "structure",
    keywords: ["layout", "tree"],
    when: (context) =>
      one(context) && branchChildren(context.items, context.selected[0].id).length > 0,
    run: ({ editor }) => tidySelection(editor),
  },
  {
    id: "structure.present",
    label: ({ selected }) => `Present ${isSlide(selected[0]) ? deckOf(selected[0]) : "deck"}`,
    help: "Present this slide's deck in your window, starting from this slide.",
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
    help: "Select every top-level object on the canvas except locked ones.",
    group: "select",
    shortcuts: [{ key: "a", ctrl: true }],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => selectAll(editor.graph, editor.document),
  },
];

export const COMMANDS = [
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
  ...CLOCK_COMMANDS,
].map(completeCommand);
