import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { describeMatch, findMatches, showMatch, type Match } from "../editor/find";
import { listComments } from "../document/comments";
import { worldBounds } from "../document/relations";
import { showFilter, showFind } from "../editor/ui";
import { isEmptyFilter } from "../editor/filter";
import { FilterBar } from "./FilterBar";
import "./discovery.css";

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
  return createPortal(
    <div ref={ref} key={match.item.id} className="find-pulse" data-testid="find-pulse" />,
    editor.element
  );
}

/** "2 of 5", "No matches", or nothing before anything is typed. */
function countLabel(searching: boolean, current: number, total: number) {
  if (!searching) return "";
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
  onShow: (index: number) => void;
}>) {
  return (
    <ul className="find-matches" aria-label="Matches">
      {matches.slice(0, 8).map((match, position) => (
        <li key={match.item.id}>
          <button
            type="button"
            className={position === current ? "active" : ""}
            data-hint-detail="Move your view to this match and select it."
            onClick={() => onShow(position)}
          >
            {describeMatch(match)}
          </button>
        </li>
      ))}
      {matches.length > 8 && (
        <li className="find-more">{matches.length - 8} more. Use Next to visit every match.</li>
      )}
    </ul>
  );
}

/**
 * One place to search words and highlight metadata. Enter and the arrows visit matches in
 * reading order; selecting tags or markers also lists the objects they highlight.
 */
function FindQuery({
  query,
  onChange,
  onStep,
  onClose,
}: Readonly<{
  query: string;
  onChange: (query: string) => void;
  onStep: (by: number) => void;
  onClose: () => void;
}>) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <input
      ref={input}
      aria-label="Find on canvas"
      placeholder="Search text, tags or markers"
      data-hint="Find on canvas"
      data-hint-detail="Search names, text, comments, tags and markers; Enter visits each match."
      value={query}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        else if (event.key === "Enter") onStep(event.shiftKey ? -1 : 1);
        else if (event.key === "ArrowDown") onStep(1);
        else if (event.key === "ArrowUp") onStep(-1);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}

function FindHeading({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
    <>
      <div className="discovery-heading">
        <Search size={16} />
        <strong>Find and filter</strong>
      </div>
      <button
        className="icon-action discovery-close"
        aria-label="Close find"
        data-hint-detail="Close find and filter; nothing stays highlighted."
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </>
  );
}

export function FindBar({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(-1);
  const [shown, setShown] = useState<Match | null>(null);
  const searching = Boolean(query.trim()) || !isEmptyFilter(editor.filter);
  const matches = findMatches(
    editor.document.list(),
    listComments(editor.document),
    query,
    editor.filter
  );
  const current = matches.length ? Math.min(index, matches.length - 1) : -1;
  const show = (position: number) => {
    const match = matches[position];
    showMatch(editor, match);
    setIndex(position);
    setShown(match);
  };
  const step = (by: number) => {
    if (!matches.length) return;
    let next = (current + by + matches.length) % matches.length;
    if (current < 0) next = by > 0 ? 0 : matches.length - 1;
    show(next);
  };
  const close = () => {
    showFilter(editor, false);
    showFind(editor, false);
  };
  return (
    <div className="find-bar discovery-panel" role="search" aria-label="Find on canvas">
      {shown && <Pulse editor={editor} match={shown} />}
      <FindHeading onClose={close} />
      <FindQuery
        query={query}
        onChange={(value) => {
          setQuery(value);
          setIndex(-1);
          setShown(null);
        }}
        onStep={step}
        onClose={close}
      />
      <span className="find-count" data-testid="find-count" aria-live="polite">
        {countLabel(searching, current, matches.length)}
      </span>
      <button
        className="icon-action"
        aria-label="Previous match"
        data-hint-detail="Move your view back to the match before this one."
        disabled={!matches.length}
        onClick={() => step(-1)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="icon-action"
        aria-label="Next match"
        data-hint-detail="Move your view on to the next match, in reading order."
        disabled={!matches.length}
        onClick={() => step(1)}
      >
        <ChevronDown size={14} />
      </button>
      <FilterBar editor={editor} />
      {searching && matches.length > 0 && (
        <MatchList matches={matches} current={current} onShow={show} />
      )}
    </div>
  );
}
