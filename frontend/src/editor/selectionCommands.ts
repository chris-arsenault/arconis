import type { Item } from "../document/types";
import type { Command, CommandContext } from "./registry";
import { SELECT_BY, inverted, selectIds, type SelectBy } from "./selectBy";
import { copyLook, hasCopiedLook, pasteLook, setDefaultLook } from "./styleClipboard";

/** Commands that choose a selection by what items share, and that carry a look between items. */

const some = ({ selected }: CommandContext) => selected.length > 0;

/** What a new item of this item's kind is called: a node by its stencil, the rest by type. */
function kindName(item: Item | undefined) {
  if (!item) return "item";
  return item.type === "node" ? item.stencil : item.type;
}

const BY: { by: SelectBy; label: string; keywords: string[] }[] = [
  { by: "type", label: "Select same type", keywords: ["kind", "stencil"] },
  { by: "style", label: "Select same style", keywords: ["named style"] },
  { by: "fill", label: "Select same fill", keywords: ["colour", "color"] },
  { by: "children", label: "Select children", keywords: ["contents", "branches"] },
  { by: "siblings", label: "Select siblings", keywords: ["same holder", "same parent"] },
  { by: "connected", label: "Select connected", keywords: ["lines", "neighbours"] },
];

export const SELECTION_COMMANDS: Command[] = [
  ...BY.map(({ by, label, keywords }): Command => ({
    id: `select.${by}`,
    label,
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
    group: "edit",
    shortcuts: [{ key: "c", ctrl: true, alt: true }],
    keywords: ["look", "format"],
    when: ({ selected }) => selected.length === 1,
    run: ({ selected }) => copyLook(selected[0]),
  },
  {
    id: "style.paste",
    label: "Paste style",
    group: "edit",
    shortcuts: [{ key: "v", ctrl: true, alt: true }],
    keywords: ["look", "format"],
    when: (context) => some(context) && hasCopiedLook(),
    run: ({ editor, selected }) => pasteLook(editor.document, selected),
  },
  {
    id: "style.default",
    label: ({ selected }) => `Use as default for new ${kindName(selected[0])}s`,
    group: "edit",
    keywords: ["remember look", "new items start"],
    when: ({ selected }) => selected.length === 1,
    run: ({ editor, selected }) => setDefaultLook(editor.document, selected[0]),
  },
];
