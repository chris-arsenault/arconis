import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  GraduationCap,
  Keyboard,
  X,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { showHelp } from "../editor/ui";
import { COMMANDS } from "../editor/commandTable";
import { GROUP_TITLES, commandContext, commandLabel, type Command } from "../editor/registry";
import { shortcutLabel } from "../editor/shortcuts";
import {
  GUIDES,
  findSection,
  guideTitle,
  isGuide,
  loadSections,
  renderGuide,
  searchSections,
  type Section,
} from "../help/guides";
import "./help.css";

export const CONTENTS = "contents";
export const COMMANDS_TOPIC = "commands";

/**
 * The help reference: the user guides, searchable and cross-linked, and every command with its
 * shortcut. It sits beside the canvas without blocking it, so a reader can try what they read.
 */
/** The tutorials the reference can start: the orientation and the hands-on practice room. */
export interface Tutorials {
  tour: () => void;
  practice: () => void;
}

export function HelpReference({
  editor,
  tutorials,
}: Readonly<{ editor: EditorController; tutorials: Tutorials }>) {
  const topic = editor.ui.help ?? CONTENTS;
  const [sections, setSections] = useState<Section[] | null>(null);
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    void loadSections().then(setSections);
  }, []);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);
  const body = useRef<HTMLDivElement>(null);
  // Following a link moves focus to what it opened, so reading continues where it appears.
  const go = (next: string) => {
    setQuery("");
    showHelp(editor, next);
    requestAnimationFrame(() => body.current?.focus({ preventScroll: true }));
  };
  const close = () => {
    showHelp(editor, null);
    const back = opener.current;
    if (back instanceof HTMLElement && back.isConnected) back.focus();
    else editor.element.focus({ preventScroll: true });
  };
  // Escape inside the reference clears a search first, then closes it.
  useEscape(panel, () => (query ? setQuery("") : close()));
  return (
    <aside
      ref={panel}
      className="help-reference"
      aria-label="Help reference"
      data-help-id="help-reference"
    >
      <header>
        <h2>Help</h2>
        <button
          className="icon-action"
          aria-label="Close help"
          data-hint-detail="Close the reference and return to where you were."
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <input
        type="search"
        aria-label="Search help"
        placeholder="Search the guides"
        data-hint-detail="Find guide sections containing every word you type."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="help-body" ref={body} tabIndex={-1}>
        <ReferenceBody
          editor={editor}
          sections={sections}
          query={query}
          topic={topic}
          onGo={go}
          tutorials={tutorials}
        />
      </div>
    </aside>
  );
}

/** A latest-value callback, readable from listeners bound once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

function useEscape(panel: RefObject<HTMLElement | null>, onEscape: () => void) {
  const latest = useLatest(onEscape);
  useEffect(() => {
    const node = panel.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    };
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [panel, latest]);
}

function ReferenceBody({
  editor,
  sections,
  query,
  topic,
  onGo,
  tutorials,
}: Readonly<{
  editor: EditorController;
  sections: Section[] | null;
  query: string;
  topic: string;
  onGo: (topic: string) => void;
  tutorials: Tutorials;
}>) {
  if (!sections) return <p className="help-loading">Loading the guides…</p>;
  if (query.trim()) return <SearchResults sections={sections} query={query} onGo={onGo} />;
  if (topic === CONTENTS) return <Contents sections={sections} onGo={onGo} tutorials={tutorials} />;
  if (topic === COMMANDS_TOPIC) return <Commands editor={editor} onGo={onGo} />;
  return <Article sections={sections} topic={topic} onGo={onGo} />;
}

function Contents({
  sections,
  onGo,
  tutorials,
}: Readonly<{ sections: Section[]; onGo: (topic: string) => void; tutorials: Tutorials }>) {
  return (
    <nav aria-label="Help contents">
      <div className="help-start">
        <button
          data-hint-detail="Walk through the workspace's main areas, one highlighted step at a time."
          onClick={tutorials.tour}
        >
          <Compass size={16} /> Take the tour
        </button>
        <button
          data-hint-detail="Open a sample room on this device and try editing, connecting, markup and presenting."
          onClick={tutorials.practice}
        >
          <GraduationCap size={16} /> Practice in a sample room
        </button>
        <button
          data-hint-detail="Every command, grouped by task, with its keyboard shortcut."
          onClick={() => onGo(COMMANDS_TOPIC)}
        >
          <Keyboard size={16} /> Commands and shortcuts
        </button>
      </div>
      {GUIDES.map((guide) => (
        <section key={guide.id} className="help-guide">
          <h3>
            <button
              data-hint-detail="Read this guide from the start."
              onClick={() => onGo(guide.id)}
            >
              {guide.title}
            </button>
          </h3>
          <ul>
            {sections
              .filter((section) => section.guide === guide.id && section.id)
              .map((section) => (
                <li key={section.id}>
                  <button
                    data-hint-detail="Open this section of the guide."
                    onClick={() => onGo(`${guide.id}#${section.id}`)}
                  >
                    {section.title}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function SearchResults({
  sections,
  query,
  onGo,
}: Readonly<{ sections: Section[]; query: string; onGo: (topic: string) => void }>) {
  const results = useMemo(() => searchSections(sections, query).slice(0, 30), [sections, query]);
  if (!results.length) return <p className="help-empty">No guide section mentions that.</p>;
  return (
    <ul className="help-results" aria-label="Search results">
      {results.map(({ section, snippet }) => (
        <li key={`${section.guide}#${section.id}`}>
          <button
            data-hint-detail="Open this section of the guide."
            onClick={() => onGo(`${section.guide}#${section.id}`)}
          >
            <small>{guideTitle(section.guide)}</small>
            <strong>{section.title}</strong>
            <span>{snippet}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Article({
  sections,
  topic,
  onGo,
}: Readonly<{ sections: Section[]; topic: string; onGo: (topic: string) => void }>) {
  const body = useRef<HTMLDivElement>(null);
  const section = findSection(sections, topic);
  const html = useMemo(() => (section ? renderGuide(section.source) : ""), [section]);
  const anchor = topic.split("#")[1] ?? "";
  useLayoutEffect(() => {
    const scroller = body.current?.closest(".help-body");
    const target = anchor ? body.current?.querySelector(`#help-${CSS.escape(anchor)}`) : null;
    if (target && anchor !== section?.id) target.scrollIntoView({ block: "start" });
    else scroller?.scrollTo({ top: 0 });
  }, [html, anchor, section]);
  // Links between guides stay inside the reference; their anchors are ordinary links.
  const follow = useLatest(onGo);
  const guide0 = section?.guide;
  useEffect(() => {
    const node = body.current;
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      const to = link.getAttribute("data-help-topic");
      const local = link.getAttribute("data-help-anchor");
      if (to !== null || local !== null || link.hasAttribute("data-help-outside"))
        event.preventDefault();
      if (to && isGuide(to.split("#")[0])) follow.current(to);
      else if (local) follow.current(`${guide0}#${local}`);
    };
    node?.addEventListener("click", onClick);
    return () => node?.removeEventListener("click", onClick);
  }, [guide0, follow]);
  if (!section) return <p className="help-empty">That guide is not available.</p>;
  const guide = sections.filter((entry) => entry.guide === section.guide);
  const index = guide.indexOf(section);
  const previous = guide[index - 1];
  const next = guide[index + 1];
  const topicOf = (entry: Section) => (entry.id ? `${entry.guide}#${entry.id}` : entry.guide);
  return (
    <article className="help-article">
      <button
        className="help-back"
        data-hint-detail="Return to the list of guides."
        onClick={() => onGo(CONTENTS)}
      >
        <ArrowLeft size={15} /> Contents
      </button>
      <p className="help-crumb">{guideTitle(section.guide)}</p>
      {!section.id && <h2>{guideTitle(section.guide)}</h2>}
      <div ref={body} className="help-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      <nav className="help-pager" aria-label="Guide pages">
        {previous && (
          <button
            data-hint-detail="Read the previous section of this guide."
            onClick={() => onGo(topicOf(previous))}
          >
            <ChevronLeft size={15} /> {previous.id ? previous.title : "Introduction"}
          </button>
        )}
        {next && (
          <button
            data-hint-detail="Read the next section of this guide."
            onClick={() => onGo(topicOf(next))}
          >
            {next.title} <ChevronRight size={15} />
          </button>
        )}
      </nav>
    </article>
  );
}

function Commands({
  editor,
  onGo,
}: Readonly<{ editor: EditorController; onGo: (topic: string) => void }>) {
  const context = commandContext(editor);
  const groups = new Map<string, Command[]>();
  for (const command of COMMANDS)
    groups.set(command.group, [...(groups.get(command.group) ?? []), command]);
  return (
    <article className="help-article help-commands">
      <button
        className="help-back"
        data-hint-detail="Return to the list of guides."
        onClick={() => onGo(CONTENTS)}
      >
        <ArrowLeft size={15} /> Contents
      </button>
      <h2>Commands and shortcuts</h2>
      <p>
        Every command is also in the command palette, Ctrl/⌘ K. Single-key shortcuts work while the
        canvas has focus.
      </p>
      {[...groups].map(([group, commands]) => (
        <section key={group}>
          <h3>{GROUP_TITLES[group as Command["group"]]}</h3>
          <dl>
            {commands.map((command) => (
              <div key={command.id}>
                <dt>
                  {commandLabel(command, context)}
                  {command.shortcuts?.map((shortcut) => (
                    <kbd key={shortcutLabel(shortcut)}>{shortcutLabel(shortcut)}</kbd>
                  ))}
                </dt>
                <dd>{command.help}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
