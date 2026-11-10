import type { Item } from "../document/types";
import type { CommandDefinition as Command, CommandContext } from "./registry";
import { SELECT_BY, inverted, selectIds, type SelectBy } from "./selectBy";
import { copyLook, hasCopiedLook, pasteLook, setDefaultLook } from "./styleClipboard";

/** Commands that choose a selection by what items share, and that carry a look between items. */

const some = ({ selected }: CommandContext) => selected.length > 0;

/** What a new item of this item's kind is called: a node by its stencil, the rest by type. */
function kindName(item: Item | undefined) {
  if (!item) return "item";
  return item.type === "node" ? item.stencil : item.type;
}

const BY: { by: SelectBy; label: string; help: string; keywords: string[] }[] = [
  {
    by: "type",
    label: "Select same type",
    help: "Select every object of the selection's kinds, telling nodes apart by stencil.",
    keywords: ["kind", "stencil"],
  },
  {
    by: "style",
    label: "Select same style",
    help: "Select every object that shares one of the selection's named styles.",
    keywords: ["named style"],
  },
  {
    by: "fill",
    label: "Select same fill",
    help: "Select every object drawn with one of the selection's fill colours.",
    keywords: ["colour", "color"],
  },
  {
    by: "children",
    label: "Select children",
    help: "Select what the selection holds directly and its direct branches.",
    keywords: ["contents", "branches"],
  },
  {
    by: "siblings",
    label: "Select siblings",
    help: "Select the objects branching from the same topic, or held by the same holder.",
    keywords: ["same holder", "same parent"],
  },
  {
    by: "connected",
    label: "Select connected",
    help: "Add the lines touching the selection and the objects at their other ends.",
    keywords: ["lines", "neighbours"],
  },
];

export const SELECTION_COMMANDS: Command[] = [
  ...BY.map(({ by, label, help, keywords }): Command => ({
    id: `select.${by}`,
    label,
    help,
    group: "select",
    keywords,
    when: some,
    run: ({ editor, items, selected }) =>
      selectIds(
        editor,
        SELECT_BY[by](items, selected, (style) => editor.document.namedStyle(style))
      ),
  })),
  {
    id: "select.invert",
    label: "Invert selection",
    help: "Select every top-level object that is not selected now, and deselect the rest.",
    group: "select",
    shortcuts: [{ key: "i", ctrl: true, shift: true }],
    when: ({ items }) => items.length > 0,
    run: ({ editor, items, selected }) => selectIds(editor, inverted(items, selected)),
  },
];

export const STYLE_COMMANDS: Command[] = [
  {
    id: "style.copy",
    label: "Copy style",
    help: "Remember this object's named style and look to paste onto others.",
    group: "edit",
    shortcuts: [{ key: "c", ctrl: true, alt: true }],
    keywords: ["look", "format"],
    when: ({ selected }) => selected.length === 1,
    run: ({ selected }) => copyLook(selected[0]),
  },
  {
    id: "style.paste",
    label: "Paste style",
    help: "Give the selection the copied style and look in place of its own, keeping its geometry.",
    group: "edit",
    shortcuts: [{ key: "v", ctrl: true, alt: true }],
    keywords: ["look", "format"],
    when: (context) => some(context) && hasCopiedLook(),
    run: ({ editor, selected }) => pasteLook(editor.document, selected),
  },
  {
    id: "style.default",
    label: ({ selected }) => `Use as default for new ${kindName(selected[0])}s`,
    help: "Start new objects of this kind with this object's look, on this page only.",
    group: "edit",
    keywords: ["remember look", "new items start"],
    when: ({ selected }) => selected.length === 1,
    run: ({ editor, selected }) => setDefaultLook(editor.document, selected[0]),
  },
];
