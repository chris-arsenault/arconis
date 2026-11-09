import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { EditorController } from "../editor/controller";
import { showRelate, showTagger } from "../editor/registry";
import { worldBounds } from "../document/relations";
import { typeLabel, type Item } from "../document/types";
import { addTags, removeTag, roomTags, sharedTags } from "../editor/tags";
import { relateTo } from "../editor/topics";
import { itemName, relateCandidates } from "../editor/relate";
import { TagEditor } from "./TagEditor";

/** Keeps a popover above the selection, or below it when there is no room, inside the canvas. */
function useAboveSelection(editor: EditorController, ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const bounds = worldBounds(editor.selected());
    if (!ref.current || !bounds) return;
    const { scale, translate } = editor.graph.view;
    const x = (bounds.x + bounds.width / 2 + translate.x) * scale;
    const top = (bounds.y + translate.y) * scale;
    const bottom = (bounds.y + bounds.height + translate.y) * scale;
    const area = editor.element.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(x - box.width / 2, area.width - box.width - 8));
    const above = top - box.height - 10;
    const y = above >= 8 ? above : Math.min(bottom + 10, area.height - box.height - 8);
    Object.assign(ref.current.style, { left: `${left}px`, top: `${Math.max(8, y)}px` });
  });
}

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
  useAboveSelection(editor, ref);
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
 * Relates the selection to another object by name: type to search, arrows to choose, Enter to
 * relate. The reference shows as a line while the object is selected.
 */
export function RelatePicker({ editor }: Readonly<{ editor: EditorController }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [close] = useState(() => () => showRelate(editor, false));
  useAboveSelection(editor, ref);
  useCloseOutside(ref, close);
  const [from] = editor.selected();
  if (!from) return null;
  const results = relateCandidates(editor.document.list(), from, query);
  const pick = (item: Item | undefined) => {
    if (!item) return;
    relateTo(editor, item.id);
    close();
  };
  return (
    <div ref={ref} className="selection-popover relate-picker" role="dialog" aria-label="Relate to">
      <input
        aria-label="Relate to"
        placeholder={`Relate ${itemName(from)} to…`}
        value={query}
        // The picker opens to type straight away.
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
    </div>
  );
}
