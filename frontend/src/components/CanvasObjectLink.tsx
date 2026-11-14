import { useEffect, useId, useRef, useState, type RefObject } from "react";
import * as Y from "yjs";
import { LocateFixed, Search } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { typeLabel, type Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { itemName } from "../editor/relate";
import { findMatches } from "../editor/find";
import { editSource } from "../editor/commands";
import { cellAt, panWithPointer } from "../editor/pointerButtons";
import { objectLinkEdit } from "../text/objectLinks";
import "./canvasObjectLink.css";

type LinkRange = { start: Y.RelativePosition; end: Y.RelativePosition };

const LINK_RESULT = "Link the text to this object; following the link later flies the view there.";

/** Select a destination visually without leaving the source or losing its CRDT text selection. */
export function CanvasObjectLink({
  editor,
  sourceId,
  textarea,
  canvasPicking,
}: Readonly<{
  editor: EditorController;
  sourceId: string;
  textarea: RefObject<HTMLTextAreaElement | null>;
  canvasPicking: boolean;
}>) {
  const [range, setRange] = useState<LinkRange | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setRange(null);
    textarea.current?.focus({ preventScroll: true });
  };
  const pick = (item: Item) => {
    const element = textarea.current;
    if (!range || !element || !editor.document.get(sourceId)) return;
    const target = editor.document.get(item.id);
    if (!target) return;
    const start = Y.createAbsolutePositionFromRelativePosition(range.start, editor.document.doc);
    const end = Y.createAbsolutePositionFromRelativePosition(range.end, editor.document.doc);
    if (!start || !end) return;
    editSource(
      editor.document,
      sourceId,
      element,
      objectLinkEdit(
        element.value,
        start.index,
        Math.max(start.index, end.index),
        target.id,
        itemName(target)
      )
    );
    setRange(null);
  };
  useCanvasTarget(editor, panel, range !== null, pick, close, () => setRange(null), canvasPicking);
  const begin = () => {
    const element = textarea.current;
    if (!element) return;
    setRange(linkRange(editor, sourceId, element));
  };
  return (
    <>
      <button
        type="button"
        aria-label="Insert canvas object link"
        aria-pressed={range !== null}
        data-hint="Link to a canvas object"
        data-hint-detail="Link the selected text to an object you click; with no text selected, its name is inserted."
        onMouseDown={(event) => event.preventDefault()}
        onClick={begin}
      >
        <LocateFixed size={14} /> Object
      </button>
      {range && (
        <ObjectLinkPanel
          ref={panel}
          editor={editor}
          onPick={pick}
          onClose={close}
          searchOnly={!canvasPicking}
        />
      )}
    </>
  );
}

function linkRange(
  editor: EditorController,
  id: string,
  element: HTMLTextAreaElement
): LinkRange | null {
  const text = editor.document.text(id);
  if (!text) return null;
  return {
    start: Y.createRelativePositionFromTypeIndex(text, element.selectionStart),
    end: Y.createRelativePositionFromTypeIndex(
      text,
      element.selectionEnd,
      element.selectionStart === element.selectionEnd ? 0 : -1
    ),
  };
}

function useCanvasTarget(
  editor: EditorController,
  panel: RefObject<HTMLDivElement | null>,
  active: boolean,
  pick: (item: Item) => void,
  close: () => void,
  dismiss: () => void,
  canvasPicking: boolean
) {
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    const options = { signal: abort.signal, capture: true };
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!canvasPicking) return;
        if (!(event.target instanceof Node) || panel.current?.contains(event.target)) return;
        if (!editor.element.contains(event.target)) return dismiss();
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.button === 2) return close();
        if (event.button === 1) return panWithPointer(editor, event);
        const item = pointedItem(editor, event);
        if (item) pick(item);
      },
      options
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      },
      options
    );
    return () => abort.abort();
  }, [editor, panel, active, pick, close, dismiss, canvasPicking]);
}

function pointedItem(editor: EditorController, event: PointerEvent) {
  const cell = cellAt(editor, event);
  return cell?.id ? editor.document.get(cell.id) : null;
}

function linkCandidates(items: Item[], query: string) {
  const candidates = query.trim()
    ? findMatches(items, [], query).map((match) => match.item)
    : items.filter((item) => !item.onLine);
  candidates.sort((a, b) => itemName(a).localeCompare(itemName(b)));
  return candidates.slice(0, 8);
}

function ObjectLinkPanel({
  ref,
  editor,
  onPick,
  onClose,
  searchOnly,
}: Readonly<{
  ref: RefObject<HTMLDivElement | null>;
  editor: EditorController;
  onPick: (item: Item) => void;
  onClose: () => void;
  searchOnly: boolean;
}>) {
  const [searching, setSearching] = useState(searchOnly);
  return (
    <div ref={ref} className="canvas-link-picker" role="group" aria-label="Choose link target">
      <div className="canvas-link-heading">
        <strong>
          {searchOnly ? "Find an object to link to" : "Click an object to link to it"}
        </strong>
        <button
          type="button"
          data-hint-detail="Stop picking a target and leave the text unlinked."
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
      <p>
        {searchOnly
          ? "Search by name, tag or id. Esc cancels."
          : "Esc or right-click cancels. Middle-drag pans."}
      </p>
      {!searching ? (
        <button
          type="button"
          data-hint-detail="Find the target by name, tag or id instead of clicking it."
          onClick={() => setSearching(true)}
        >
          <Search size={13} /> Search objects
        </button>
      ) : (
        <ObjectLinkSearch editor={editor} onPick={onPick} />
      )}
    </div>
  );
}

function ObjectLinkSearch({
  editor,
  onPick,
}: Readonly<{ editor: EditorController; onPick: (item: Item) => void }>) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = linkCandidates(editor.document.list(), query);
  return (
    <>
      <input
        type="search"
        role="combobox"
        aria-label="Search canvas objects"
        data-hint-detail="Type a name, tag or id; Enter links the text to the highlighted object."
        placeholder="Name, tag or id"
        value={query}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
        // Searching is explicitly opened so typing can begin immediately.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          const count = Math.max(1, results.length);
          if (event.key === "ArrowDown") setActive((active + 1) % count);
          else if (event.key === "ArrowUp") setActive((active - 1 + count) % count);
          else if (event.key === "Enter") {
            if (results[active]) onPick(results[active]);
          } else return;
          event.preventDefault();
        }}
      />
      <ObjectLinkResults
        editor={editor}
        items={results}
        listId={listId}
        active={active}
        onActive={setActive}
        onPick={onPick}
      />
      {!results.length && <p>No matching objects.</p>}
    </>
  );
}

function ObjectLinkResults({
  editor,
  items,
  listId,
  active,
  onActive,
  onPick,
}: Readonly<{
  editor: EditorController;
  items: Item[];
  listId: string;
  active: number;
  onActive: (index: number) => void;
  onPick: (item: Item) => void;
}>) {
  return (
    <ul id={listId} role="listbox" aria-label="Objects to link to">
      {items.map((item, index) => (
        <li
          key={item.id}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={active === index}
          data-hint-detail={LINK_RESULT}
        >
          <button
            type="button"
            data-hint={itemName(item)}
            data-hint-detail={LINK_RESULT}
            data-tip={`${typeLabel(item)} · ${item.id}`}
            onMouseEnter={() => onActive(index)}
            onClick={() => onPick(item)}
          >
            <span
              className="canvas-link-swatch"
              ref={(node) => {
                node?.style.setProperty(
                  "--object-link-fill",
                  effectiveAppearance(item, editor.document.namedStyle(item.style)).fill
                );
              }}
            />
            <span>{itemName(item)}</span>
            <small>{item.name.trim() ? typeLabel(item) : item.id}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}
