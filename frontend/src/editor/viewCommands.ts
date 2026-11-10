import type { View, Item } from "../document/types";
import { worldBounds } from "../document/relations";
import type { EditorController } from "./controller";
import type { Command, CommandContext } from "./registry";
import { showFind, showPalette } from "./ui";
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
    group: "view",
    shortcuts: [{ key: "k", ctrl: true }],
    keywords: ["commands", "shortcuts", "help"],
    run: ({ editor }) => showPalette(editor, !editor.ui.palette),
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
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
    group: "view",
    shortcuts: [{ key: "-", ctrl: true }],
    run: ({ editor }) => editor.zoom(1 / 1.2),
  },
  {
    id: "view.zoomInto",
    label: "Zoom into selection",
    group: "view",
    shortcuts: [{ key: "z" }],
    when: one,
    run: ({ editor }) => zoomIntoSelection(editor),
  },
  {
    id: "view.zoomOutOf",
    label: "Zoom back out",
    group: "view",
    shortcuts: [{ key: "z", shift: true }],
    run: ({ editor }) => zoomOutOfSelection(editor),
  },
  {
    id: "view.fit",
    label: "Fit canvas",
    group: "view",
    shortcuts: [{ key: "1", shift: true }],
    keywords: ["zoom to fit", "everything", "back to content"],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => editor.fit(),
  },
  {
    id: "view.fitSelection",
    label: "Fit selection",
    group: "view",
    shortcuts: [{ key: "2", shift: true }],
    keywords: ["zoom to selection"],
    when: ({ selected }) => selected.length > 0,
    run: ({ editor, selected }) => fitSelection(editor, selected),
  },
  {
    id: "view.actualSize",
    label: "Zoom to 100%",
    group: "view",
    shortcuts: [{ key: "0", shift: true }],
    keywords: ["actual size", "reset zoom"],
    run: ({ editor }) =>
      flyToView(editor.graph, editor.element, { ...editor.history.current(), zoom: 1 }),
  },
  {
    id: "view.back",
    label: "Back to previous view",
    group: "view",
    shortcuts: [{ key: "[", ctrl: true }],
    keywords: ["history", "return"],
    when: ({ editor }) => editor.history.canGoBack(),
    run: ({ editor }) => travel(editor, editor.history.goBack()),
  },
  {
    id: "view.forward",
    label: "Forward to next view",
    group: "view",
    shortcuts: [{ key: "]", ctrl: true }],
    keywords: ["history"],
    when: ({ editor }) => editor.history.canGoForward(),
    run: ({ editor }) => travel(editor, editor.history.goForward()),
  },
  {
    id: "view.find",
    label: "Find on canvas",
    group: "view",
    shortcuts: [{ key: "f", ctrl: true }],
    keywords: ["search", "locate"],
    when: ({ items }) => items.length > 0,
    run: ({ editor }) => showFind(editor, true),
  },
  {
    id: "view.grid",
    label: ({ editor }) => (editor.grid.visible ? "Hide grid" : "Show grid"),
    group: "view",
    keywords: ["snap"],
    run: ({ editor }) => editor.grid.toggle(),
  },
  {
    id: "view.references",
    label: ({ editor }) =>
      editor.referencesVisible ? "Hide reference lines" : "Show reference lines",
    group: "view",
    run: ({ editor }) => editor.toggleReferences(),
  },
  {
    id: "view.save",
    label: "Save this view",
    group: "view",
    keywords: ["bookmark", "place"],
    run: ({ editor }) => saveCurrentView(editor, `View ${editor.document.views.size + 1}`),
  },
];
