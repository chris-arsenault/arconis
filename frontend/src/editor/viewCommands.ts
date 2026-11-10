import type { View, Item } from "../document/types";
import { worldBounds } from "../document/relations";
import type { EditorController } from "./controller";
import type { Command, CommandContext } from "./registry";
import { showFind, showHelp, showPalette } from "./ui";
import { helpZone } from "../help/zone";
import { zoomIntoSelection, zoomOutOfSelection } from "./topics";
import { fittingView, flyToView, saveCurrentView } from "./views";

/** Commands over this person's view: the palette, zoom, the grid, references and saved views. */

const one = ({ selected }: CommandContext) => selected.length === 1;
/** How much of the window a fitted selection fills. */
const SELECTION_FILL = 0.8;

function fitSelection(editor: EditorController, selected: Item[]) {
  const box = worldBounds(selected);
  if (box)
    flyToView(editor.graph, editor.element, fittingView(box, editor.element, SELECTION_FILL));
}

/** Flies through the view history without recording the flight as another jump. */
function travel(editor: EditorController, view: View | null) {
  if (!view) return;
  editor.history.travel(() => flyToView(editor.graph, editor.element, view));
}

export const VIEW_COMMANDS: Command[] = [
  {
    id: "view.palette",
    label: "Command palette",
    help: "Search every command that applies now and run it, with its shortcut shown.",
    group: "view",
    shortcuts: [{ key: "k", ctrl: true }],
    keywords: ["commands", "shortcuts", "help"],
    run: ({ editor }) => showPalette(editor, !editor.ui.palette),
  },
  {
    id: "view.help",
    label: "Help",
    help: "Open the guides, every command and the tour, at the area you are pointing at.",
    group: "view",
    shortcuts: [{ key: "?", shift: true }],
    keywords: ["guide", "manual", "reference", "tour", "tutorial"],
    // The area named in the help zone, if any, opens at its guide.
    run: ({ editor }) =>
      showHelp(editor, editor.ui.help === null ? helpZone.snapshot()?.topic || "contents" : null),
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    help: "Magnify the canvas one step in your view.",
    group: "view",
    shortcuts: [
      { key: "=", ctrl: true },
      { key: "+", ctrl: true },
    ],
    run: ({ editor }) => editor.zoom(1.2),
  },
  {
    id: "view.zoomOut",
    label: "Zoom out",
    help: "Shrink the canvas one step in your view to see more of it.",
    group: "view",
    shortcuts: [{ key: "-", ctrl: true }],
    run: ({ editor }) => editor.zoom(1 / 1.2),
  },
  {
    id: "view.zoomInto",
    label: "Zoom into selection",
    help: "Fly in until the selected object fills the window, revealing what it holds.",
    group: "view",
    shortcuts: [{ key: "z" }],
    when: one,
    run: ({ editor }) => zoomIntoSelection(editor),
  },
  {
    id: "view.zoomOutOf",
    label: "Zoom back out",
    help: "Fly out to the object holding the selection, or to the whole canvas.",
    group: "view",
    shortcuts: [{ key: "z", shift: true }],
    run: ({ editor }) => zoomOutOfSelection(editor),
  },
  {
    id: "view.fit",
    label: "Fit canvas",
    help: "Zoom and scroll so everything on the canvas is in view.",
    group: "view",
    shortcuts: [{ key: "1", shift: true }],
    keywords: ["zoom to fit", "everything", "back to content"],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => editor.fit(),
  },
  {
    id: "view.fitSelection",
    label: "Fit selection",
    help: "Zoom and scroll so the selection fills most of the window.",
    group: "view",
    shortcuts: [{ key: "2", shift: true }],
    keywords: ["zoom to selection"],
    when: ({ selected }) => selected.length > 0,
    run: ({ editor, selected }) => fitSelection(editor, selected),
  },
  {
    id: "view.actualSize",
    label: "Zoom to 100%",
    help: "Show the canvas at actual size without changing which part you are looking at.",
    group: "view",
    shortcuts: [{ key: "0", shift: true }],
    keywords: ["actual size", "reset zoom"],
    run: ({ editor }) =>
      flyToView(editor.graph, editor.element, { ...editor.history.current(), zoom: 1 }),
  },
  {
    id: "view.back",
    label: "Back to previous view",
    help: "Fly back to the place and zoom you were at before your last jump.",
    group: "view",
    shortcuts: [{ key: "[", ctrl: true }],
    keywords: ["history", "return"],
    when: ({ editor }) => editor.history.canGoBack(),
    run: ({ editor }) => travel(editor, editor.history.goBack()),
  },
  {
    id: "view.forward",
    label: "Forward to next view",
    help: "Fly forward again to the view you went back from.",
    group: "view",
    shortcuts: [{ key: "]", ctrl: true }],
    keywords: ["history"],
    when: ({ editor }) => editor.history.canGoForward(),
    run: ({ editor }) => travel(editor, editor.history.goForward()),
  },
  {
    id: "view.find",
    label: "Find on canvas",
    help: "Search the canvas for text and visit each matching object in turn.",
    group: "view",
    shortcuts: [{ key: "f", ctrl: true }],
    keywords: ["search", "locate"],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => showFind(editor, true),
  },
  {
    id: "view.grid",
    label: ({ editor }) => (editor.grid.visible ? "Hide grid" : "Show grid"),
    help: "Show or hide the grid objects snap to; the choice stays in your browser.",
    group: "view",
    keywords: ["snap"],
    run: ({ editor }) => editor.grid.toggle(),
  },
  {
    id: "view.references",
    label: ({ editor }) =>
      editor.referencesVisible ? "Hide reference lines" : "Show reference lines",
    help: "Show or hide all reference lines, not only the selection's, in your view only.",
    group: "view",
    run: ({ editor }) => editor.toggleReferences(),
  },
  {
    id: "view.save",
    label: "Save this view",
    help: "Save the window's place and zoom as a named view everyone in the room can visit.",
    group: "view",
    keywords: ["bookmark", "place"],
    run: ({ editor }) => saveCurrentView(editor, `View ${editor.document.views.size + 1}`),
  },
];
