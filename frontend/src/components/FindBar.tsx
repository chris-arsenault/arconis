import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { describeMatch, findMatches, showMatch, type Match } from "../editor/find";
import { listComments } from "../document/comments";
import { worldBounds } from "../document/relations";
import { showFind } from "../editor/registry";

/** A brief ring around the found object, where it is drawn, so the eye lands on it. */
function Pulse({ editor, match }: Readonly<{ editor: EditorController; match: Match }>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = worldBounds([match.item]);
    if (!ref.current || !box) return;
    const { scale, translate } = editor.graph.view;
    Object.assign(ref.current.style, {
      left: `${(box.x + translate.x) * scale}px`,
      top: `${(box.y + translate.y) * scale}px`,
      width: `${box.width * scale}px`,
      height: `${box.height * scale}px`,
    });
  });
  return <div ref={ref} key={match.item.id} className="find-pulse" data-testid="find-pulse" />;
}

/** "2 of 5", "No matches", or nothing before anything is typed. */
function countLabel(query: string, current: number, total: number) {
  if (!query) return "";
  return total ? `${current + 1} of ${total}` : "No matches";
}

/**
 * Find on canvas: words typed here match names, subtitles, tags, comments and ids. Enter and the
 * arrows step through the matches in reading order, flying to each; Escape closes.
 */
export function FindBar({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<Match | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const matches = findMatches(editor.document.list(), listComments(editor.document), query);
  const current = matches.length ? Math.min(index, matches.length - 1) : -1;
  const step = (by: number) => {
    if (!matches.length) return;
    const next = (current + by + matches.length) % matches.length;
    setIndex(next);
    showMatch(editor, matches[next]);
    setShown(matches[next]);
  };
  const close = () => showFind(editor, false);
  return (
    <div className="find-bar" role="search" aria-label="Find on canvas">
      {shown && !shown.hidden && <Pulse editor={editor} match={shown} />}
      <input
        ref={input}
        aria-label="Find on canvas"
        placeholder="Find"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
          setShown(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          else if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
          else if (event.key === "ArrowDown") step(1);
          else if (event.key === "ArrowUp") step(-1);
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <span className="find-count" data-testid="find-count">
        {countLabel(query, current, matches.length)}
      </span>
      <button className="icon-action" aria-label="Previous match" onClick={() => step(-1)}>
        <ChevronUp size={14} />
      </button>
      <button className="icon-action" aria-label="Next match" onClick={() => step(1)}>
        <ChevronDown size={14} />
      </button>
      <button className="icon-action" aria-label="Close find" onClick={close}>
        <X size={14} />
      </button>
      {query && matches.length > 0 && (
        <ul className="find-matches" aria-label="Matches">
          {matches.slice(0, 8).map((match, position) => (
            <li key={match.item.id}>
              <button
                type="button"
                className={position === current ? "active" : ""}
                onClick={() => {
                  setIndex(position);
                  showMatch(editor, match);
                  setShown(match);
                }}
              >
                {describeMatch(match)}
              </button>
            </li>
          ))}
          {matches.length > 8 && <li className="find-more">and {matches.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}
