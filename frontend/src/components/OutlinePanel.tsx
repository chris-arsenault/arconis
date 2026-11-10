import { useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EditorController } from "../editor/controller";
import {
  indentUnderPrevious,
  outlineRows,
  treeRootOf,
  treeRoots,
  type OutlineRow,
} from "../editor/outline";
import { changeFields } from "../editor/commands";
import { jumpTo, addBranch, tidySelection } from "../editor/topics";
import { promote, reorderSibling } from "../editor/treeEdits";
import { typeLabel, type Item } from "../document/types";
import { RailSection } from "./RailSection";

/** The keys that edit the tree from a row, the same as on the canvas. */
function rowKeys(editor: EditorController, item: Item, onRename: () => void) {
  return (event: KeyboardEvent) => {
    const handlers: Record<string, () => unknown> = {
      Tab: () =>
        event.shiftKey
          ? promote(editor.document, item.id)
          : indentUnderPrevious(editor.document, item.id),
      Enter: () => {
        editor.select(item.id);
        addBranch(editor, !event.shiftKey);
      },
      ArrowUp: () => event.altKey && reorderSibling(editor.document, item.id, -1),
      ArrowDown: () => event.altKey && reorderSibling(editor.document, item.id, 1),
      F2: onRename,
    };
    const handler = handlers[event.key];
    if (!handler || (event.key.startsWith("Arrow") && !event.altKey)) return;
    event.preventDefault();
    handler();
  };
}

function RenameField({
  editor,
  item,
  name,
  onDone,
}: Readonly<{ editor: EditorController; item: Item; name: string; onDone: () => void }>) {
  return (
    <input
      className="outline-name"
      aria-label={`Rename ${name}`}
      data-hint-detail="Type the new text for this branch; Enter keeps it and Escape cancels."
      defaultValue={item.name}
      ref={(input) => input?.select()}
      onBlur={(event) => {
        editor.document.editText(item.id, event.target.value);
        onDone();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") onDone();
      }}
    />
  );
}

/** A row of the outline: its fold toggle, its name to click or rename, and the keys that edit it. */
function Row({
  editor,
  row,
  selected,
  renaming,
  onRename,
}: Readonly<{
  editor: EditorController;
  row: OutlineRow;
  selected: boolean;
  renaming: boolean;
  onRename: (id: string | null) => void;
}>) {
  const { item, depth, heads } = row;
  const name = item.name.split("\n")[0] || typeLabel(item);
  const fold = () =>
    changeFields(editor.document, [item.id], { collapsed: item.collapsed ? undefined : true });
  return (
    <li className="outline-row" data-depth={Math.min(depth, 8)} data-testid="outline-row">
      {heads ? (
        <button
          className="outline-fold"
          aria-label={item.collapsed ? `Expand ${name}` : `Collapse ${name}`}
          data-hint-detail="Fold or unfold this branch's children, on the canvas for everyone too."
          onClick={fold}
        >
          {item.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : (
        <span className="outline-fold" />
      )}
      {renaming ? (
        <RenameField editor={editor} item={item} name={name} onDone={() => onRename(null)} />
      ) : (
        <button
          className={selected ? "outline-name selected" : "outline-name"}
          data-hint-detail="Select this branch and move your view to it; double-click to rename."
          onClick={() => jumpTo(editor, item.id)}
          onDoubleClick={() => onRename(item.id)}
          onKeyDown={rowKeys(editor, item, () => onRename(item.id))}
        >
          {name}
        </button>
      )}
    </li>
  );
}

/**
 * The selected tree as an outline, or every tree when nothing is selected: the text form of a
 * mind map, where Tab, Shift Tab, Enter and Alt arrows edit it as they do on the canvas.
 */
export function OutlinePanel({
  editor,
  open,
  onToggle,
}: Readonly<{
  editor: EditorController;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
}>) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const items = editor.document.list();
  const selected = editor.selected();
  const rootIds = selected.length
    ? [...new Set(selected.map((item) => treeRootOf(items, item.id)))]
    : treeRoots(items).map((root) => root.id);
  const rows = rootIds
    .flatMap((rootId) => outlineRows(items, rootId))
    .filter((row) => row.heads || row.depth > 0);
  if (!rows.length) return null;
  const chosen = new Set(selected.map((item) => item.id));
  return (
    <RailSection
      id="outline"
      title="Outline"
      detail="The selected tree, or every tree, as an indented list you can edit."
      open={open}
      onToggle={onToggle}
    >
      <ul className="outline-list rail-list">
        {rows.map((row) => (
          <Row
            key={row.item.id}
            editor={editor}
            row={row}
            selected={chosen.has(row.item.id)}
            renaming={renaming === row.item.id}
            onRename={setRenaming}
          />
        ))}
      </ul>
      {selected.length === 1 && (
        <button
          className="text-action"
          data-hint-detail="Lay out the selected object's branches again in a neat tree."
          onClick={() => tidySelection(editor)}
        >
          Tidy branches
        </button>
      )}
    </RailSection>
  );
}
