import { useEffect, useRef, useState, type RefObject } from "react";
import type { EditorController } from "../editor/controller";
import { showRelate, showTagger } from "../editor/registry";
import { typeLabel, type Item } from "../document/types";
import { addTags, removeTag, roomTags, sharedTags } from "../editor/tags";
import { relateTo } from "../editor/topics";
import { itemName, relateCandidates } from "../editor/relate";
import { TagEditor } from "./TagEditor";
import { useSelectionAnchor } from "./useSelectionAnchor";
import "./relate.css";

/** Closes a popover on a press outside it. */
function useCloseOutside(ref: RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) close();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [ref, close]);
}

/** Tags for the selection, typed where the selection is: the ring's and menu's Tag… opens it. */
export function TagPopover({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [close] = useState(() => () => showTagger(editor, false));
  useSelectionAnchor(editor, ref);
  useCloseOutside(ref, close);
  const selected = editor.selected();
  if (!selected.length) return null;
  const canvas = editor.document;
  return (
    <div ref={ref} className="selection-popover" role="dialog" aria-label="Tags">
      <TagEditor
        tags={sharedTags(selected)}
        known={roomTags(canvas.list()).map(({ tag }) => tag)}
        onAdd={(tags) => addTags(canvas, selected, tags)}
        onRemove={(tag) => removeTag(canvas, selected, tag)}
        focusOnOpen
        onDone={close}
      />
    </div>
  );
}

/**
 * Canvas target picking comes first; name search remains available for distant objects.
 */
export function RelatePicker({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [close] = useState(() => () => showRelate(editor, false));
  useSelectionAnchor(editor, ref);
  const from = editor.ui.relating ? editor.document.get(editor.ui.relating) : undefined;
  if (!from) return null;
  const results = relateCandidates(editor.document.list(), from, query);
  const pick = (item: Item | undefined) => {
    if (!item) return;
    relateTo(editor, item.id, from.id);
    close();
  };
  return (
    <div ref={ref} className="selection-popover relate-picker" role="dialog" aria-label="Relate to">
      <div className="relate-mode-head">
        <strong>Relate to another object</strong>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
      <p className="relate-instruction">
        Click an object on the canvas. Esc or right-click cancels.
      </p>
      {!searching && (
        <button type="button" className="relate-search-toggle" onClick={() => setSearching(true)}>
          Search by name
        </button>
      )}
      {searching && (
        <>
          <input
            aria-label="Relate to"
            placeholder={`Relate ${itemName(from)} to…`}
            value={query}
            // Searching is optional and explicitly opened to type straight away.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "ArrowDown") setActive((active + 1) % Math.max(1, results.length));
              else if (event.key === "ArrowUp")
                setActive((active - 1 + results.length) % Math.max(1, results.length));
              else if (event.key === "Enter") pick(results[active]);
              else if (event.key === "Escape") close();
              else return;
              event.preventDefault();
            }}
          />
          {results.length ? (
            <ul role="listbox" aria-label="Objects to relate to">
              {results.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === active}>
                  <button onMouseEnter={() => setActive(index)} onClick={() => pick(item)}>
                    <span className="relate-name">{itemName(item)}</span>
                    <span className="relate-kind">{typeLabel(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="relate-empty">No object has that name.</p>
          )}
        </>
      )}
    </div>
  );
}
