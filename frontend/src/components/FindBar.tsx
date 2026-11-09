import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { describeMatch, findMatches, revealMatch, showMatch, type Match } from "../editor/find";
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
  if (!total) return "No matches";
  const noun = total === 1 ? "match" : "matches";
  return current < 0 ? `${total} ${noun}` : `${current + 1} of ${total}`;
}

function MatchList({
  matches,
  current,
  onShow,
}: Readonly<{
  matches: Match[];
  current: number;
  onShow: (index: number, reveal?: boolean) => void;
}>) {
  return (
    <ul className="find-matches" aria-label="Matches">
      {matches.slice(0, 8).map((match, position) => (
        <li key={match.item.id}>
          <button
            type="button"
            className={position === current ? "active" : ""}
            onClick={() => onShow(position)}
          >
            {describeMatch(match)}
          </button>
          {match.hidden && (
            <button
              type="button"
              className="find-reveal"
              aria-label={`Reveal ${match.item.name.split("\n")[0] || "this object"}`}
              data-hint="Reveal this object"
              data-hint-detail="Leave other hidden objects hidden. Hidden containers needed to show this object are revealed too."
              onClick={() => onShow(position, true)}
            >
              <Eye size={14} />
            </button>
          )}
        </li>
      ))}
      {matches.length > 8 && <li className="find-more">and {matches.length - 8} more</li>}
    </ul>
  );
}

/**
 * Find on canvas: words typed here match names, subtitles, tags, comments and ids. Enter and the
 * arrows step through the matches in reading order, flying to each; Escape closes.
 */
export function FindBar({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(-1);
  const [shown, setShown] = useState<Match | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const matches = findMatches(editor.document.list(), listComments(editor.document), query);
  const current = matches.length ? Math.min(index, matches.length - 1) : -1;
  const show = (position: number, reveal = false) => {
    const match = matches[position];
    if (reveal) revealMatch(editor, match);
    else showMatch(editor, match);
    setIndex(position);
    setShown({ ...match, hidden: reveal ? false : match.hidden });
  };
  const step = (by: number) => {
    if (!matches.length) return;
    let next = (current + by + matches.length) % matches.length;
    if (current < 0) next = by > 0 ? 0 : matches.length - 1;
    show(next);
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
          setIndex(-1);
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
        <MatchList matches={matches} current={current} onShow={show} />
      )}
    </div>
  );
}
