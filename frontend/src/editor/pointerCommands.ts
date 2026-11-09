import { COLORS, isBox, isFrame, isLink, type Item } from "../document/types";
import { changeSelectionLook } from "./commands";
import type { Command, CommandContext } from "./registry";
import {
  KINDS,
  changeKind,
  clearWaypoints,
  fitFrameToContents,
  reverseLine,
  swapPositions,
  type Kind,
} from "./swap";
import { pasteFromClipboard } from "./clipboardInput";
import { creationSize, creationValues } from "./zoom";
import { containerAt } from "./panels";
import { showComments } from "./registry";

/** Commands the pointer reaches for: the ring's colours and shapes, verbs for lines and frames. */

const KIND_LABELS: Record<Kind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  decision: "Decision",
  service: "Service",
  database: "Database",
  cloud: "Cloud",
  person: "Person",
  note: "Sticky note",
  text: "Text",
  card: "Card",
  icon: "Icon",
  junction: "Junction",
};

/** Where a menu's "here" is: the point it opened at, else under the pointer, else the middle. */
function here({ editor }: CommandContext) {
  return editor.ui.menu?.world ?? (editor.pointer ? editor.worldPoint(editor.pointer) : null);
}

const HERE_NAMES = { note: "Your idea here", text: "Text", frame: "Frame" } as const;

function addHere(context: CommandContext, type: keyof typeof HERE_NAMES) {
  const { editor } = context;
  const point = here(context);
  const scale = editor.graph.view.scale;
  const size = creationSize(type, scale);
  const x = point ? point.x - size.width / 2 : undefined;
  const y = point ? point.y - size.height / 2 : undefined;
  const id =
    x !== undefined && y !== undefined
      ? editor.document.create(type, x, y, {
          name: HERE_NAMES[type],
          inside: containerAt(editor.document, point!.x, point!.y, size),
          ...creationValues(type, scale),
          ...size,
        })
      : editor.add(type);
  editor.select(id);
  editor.edit(id, true);
}

const changeable = ({ selected }: CommandContext) =>
  selected.some((item) => item.type === "node" || ["note", "text", "card"].includes(item.type));

export const POINTER_COMMANDS: Command[] = [
  {
    id: "create.noteHere",
    label: "Add note here",
    group: "create",
    keywords: ["sticky"],
    run: (context) => addHere(context, "note"),
  },
  {
    id: "create.textHere",
    label: "Add text here",
    group: "create",
    run: (context) => addHere(context, "text"),
  },
  {
    id: "create.frameHere",
    label: "Add frame here",
    group: "create",
    keywords: ["container", "group area"],
    run: (context) => addHere(context, "frame"),
  },
  {
    id: "edit.pasteHere",
    label: "Paste here",
    group: "edit",
    when: ({ editor }) => editor.room !== null,
    run: (context) => {
      const at = here(context);
      void pasteFromClipboard(context.editor, context.editor.room!, at ? { at } : undefined);
    },
  },
  {
    id: "comments.open",
    label: "Comment…",
    group: "edit",
    shortcuts: [{ key: "c", shift: true }],
    keywords: ["discussion", "thread", "note to others"],
    when: ({ selected }) => selected.length === 1,
    run: ({ editor, selected }) => showComments(editor, selected[0].id),
  },
  {
    id: "structure.swapPositions",
    label: "Swap positions",
    group: "arrange",
    keywords: ["exchange places"],
    when: ({ selected }) => selected.length === 2 && selected.every(isBox),
    run: ({ editor, selected }) => swapPositions(editor.document, selected[0].id, selected[1].id),
  },
  {
    id: "line.reverse",
    label: "Reverse direction",
    group: "arrange",
    keywords: ["flip arrow", "turn around"],
    when: ({ selected }) => selected.length === 1 && isLink(selected[0]),
    run: ({ editor, selected }) => reverseLine(editor.document, selected[0].id),
  },
  {
    id: "line.clearPoints",
    label: "Clear bend points",
    group: "arrange",
    keywords: ["straighten", "reset route", "waypoints"],
    when: ({ selected }) =>
      selected.length === 1 &&
      isLink(selected[0]) &&
      (selected[0].points.length > 0 || Boolean(selected[0].x || selected[0].y)),
    run: ({ editor, selected }) => clearWaypoints(editor.document, selected[0].id),
  },
  {
    id: "arrange.fitFrame",
    label: "Fit frame to contents",
    group: "arrange",
    keywords: ["shrink wrap", "snug"],
    when: ({ selected, items }) =>
      selected.length === 1 &&
      isFrame(selected[0]) &&
      items.some((item) => item.inside === selected[0].id && isBox(item)),
    run: ({ editor, selected }) => fitFrameToContents(editor.document, selected[0].id),
  },
  ...COLORS.map((color, index): Command => ({
    id: `colour.${index}`,
    label: `Fill ${color}`,
    group: "edit",
    keywords: ["colour", "color", "swatch"],
    when: ({ selected }) => selected.some((item) => isBox(item) || item.type === "drawing"),
    run: ({ editor, selected }) => changeSelectionLook(editor.document, selected, { fill: color }),
  })),
  {
    id: "colour.clear",
    label: "Default fill",
    group: "edit",
    keywords: ["colour", "color", "reset"],
    when: ({ selected }) => selected.some((item) => item.look.fill !== undefined),
    run: ({ editor, selected }) =>
      changeSelectionLook(editor.document, selected, { fill: undefined }),
  },
  ...KINDS.map((kind): Command => ({
    id: `shape.${kind}`,
    label: `Change to ${KIND_LABELS[kind].toLowerCase()}`,
    group: "edit",
    keywords: ["swap shape", "convert", "stencil"],
    when: changeable,
    run: ({ editor, selected }) =>
      changeKind(
        editor.document,
        selected.map((item: Item) => item.id),
        kind
      ),
  })),
];
