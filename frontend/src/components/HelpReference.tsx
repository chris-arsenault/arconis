import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Compass, Keyboard, X } from "lucide-react";
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

const CONTENTS = "contents";
const COMMANDS_TOPIC = "commands";

/** What the content pane shows when Help opens without a topic. */
const FIRST_GUIDE = "getting-started";

/**
 * The help reference: a centred dialog with the topics on the left and the chosen guide section,
 * search results or command list on the right. A narrow screen shows one side at a time.
 */
export function HelpReference({
  editor,
  onTour,
}: Readonly<{ editor: EditorController; onTour: () => void }>) {
  const topic = editor.ui.help ?? CONTENTS;
  const [sections, setSections] = useState<Section[] | null>(null);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void loadSections().then(setSections);
  }, []);
  useEffect(() => {
    const node = dialog.current!;
    // Canvas shortcuts stay out of the dialog while it is open.
    const stop = (event: KeyboardEvent) => event.stopPropagation();
    node.addEventListener("keydown", stop);
    node.showModal();
    return () => node.removeEventListener("keydown", stop);
  }, []);
  // Following a link moves focus to what it opened, so reading continues where it appears.
  const go = (next: string) => {
    setQuery("");
    showHelp(editor, next);
    requestAnimationFrame(() => body.current?.focus({ preventScroll: true }));
  };
  const shown = topic === CONTENTS ? FIRST_GUIDE : topic;
  const view = topic === CONTENTS && !query.trim() ? "topics" : "content";
  return (
    <dialog
      ref={dialog}
      className="help-dialog"
      aria-labelledby="help-title"
      data-help-id="help-reference"
      data-view={view}
      // Escape clears a search first, then closes Help; the dialog returns focus by itself.
      onCancel={(event) => {
        if (!query) return;
        event.preventDefault();
        setQuery("");
      }}
      onClose={() => showHelp(editor, null)}
    >
      <HelpHeader query={query} onQuery={setQuery} onClose={() => dialog.current?.close()} />
      <div className="help-layout">
        <Topics sections={sections} current={query.trim() ? "" : shown} onGo={go} onTour={onTour} />
        <div className="help-body" ref={body} tabIndex={-1}>
          <button
            className="help-back"
            data-hint-detail="Return to the list of help topics."
            onClick={() => go(CONTENTS)}
          >
            <ArrowLeft size={15} /> Topics
          </button>
          <ReferenceBody
            editor={editor}
            sections={sections}
            query={query}
            topic={shown}
            onGo={go}
          />
        </div>
      </div>
    </dialog>
  );
}

function HelpHeader({
  query,
  onQuery,
  onClose,
}: Readonly<{ query: string; onQuery: (query: string) => void; onClose: () => void }>) {
  return (
    <header>
      <h2 id="help-title">Help</h2>
      <input
        type="search"
        aria-label="Search help"
        placeholder="Search the guides"
        data-hint-detail="Find guide sections containing every word you type."
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <button
        className="icon-action"
        aria-label="Close help"
        data-hint-detail="Close Help and return to where you were."
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </header>
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

function ReferenceBody({
  editor,
  sections,
  query,
  topic,
  onGo,
}: Readonly<{
  editor: EditorController;
  sections: Section[] | null;
  query: string;
  topic: string;
  onGo: (topic: string) => void;
}>) {
  if (!sections) return <p className="help-loading">Loading the guides…</p>;
  if (query.trim()) return <SearchResults sections={sections} query={query} onGo={onGo} />;
  if (topic === COMMANDS_TOPIC) return <Commands editor={editor} />;
  return <Article sections={sections} topic={topic} onGo={onGo} />;
}

/** The left side: the tour, commands and guides, with the open guide's sections listed. */
function Topics({
  sections,
  current,
  onGo,
  onTour,
}: Readonly<{
  sections: Section[] | null;
  current: string;
  onGo: (topic: string) => void;
  onTour: () => void;
}>) {
  const guide = current.split("#")[0];
  const open = sections && findSection(sections, current);
  return (
    <nav className="help-topics" aria-label="Help topics">
      <div className="help-start">
        <button
          data-hint-detail="Walk through the workspace's main areas, one highlighted step at a time."
          onClick={onTour}
        >
          <Compass size={16} /> Take the tour
        </button>
        <button
          aria-current={current === COMMANDS_TOPIC ? "page" : undefined}
          data-hint-detail="Every command, grouped by task, with its keyboard shortcut."
          onClick={() => onGo(COMMANDS_TOPIC)}
        >
          <Keyboard size={16} /> Commands and shortcuts
        </button>
      </div>
      <h3>Guides</h3>
      <ul>
        {GUIDES.map(({ id, title }) => (
          <li key={id}>
            <button
              className="help-guide"
              aria-current={guide === id && !open?.id ? "page" : undefined}
              aria-expanded={guide === id}
              data-hint-detail="Read this guide from the start."
              onClick={() => onGo(id)}
            >
              {title}
            </button>
            {guide === id && sections && (
              <ul>
                {sections
                  .filter((section) => section.guide === id && section.id)
                  .map((section) => (
                    <li key={section.id}>
                      <button
                        aria-current={open === section ? "page" : undefined}
                        data-hint-detail="Open this section of the guide."
                        onClick={() => onGo(`${id}#${section.id}`)}
                      >
                        {section.title}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
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
  const content = useMemo(() => ({ __html: html }), [html]);
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
      <p className="help-crumb">{guideTitle(section.guide)}</p>
      {!section.id && <h2>{guideTitle(section.guide)}</h2>}
      <div ref={body} className="help-markdown" dangerouslySetInnerHTML={content} />
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

function Commands({ editor }: Readonly<{ editor: EditorController }>) {
  const context = commandContext(editor);
  const groups = new Map<string, Command[]>();
  for (const command of COMMANDS)
    groups.set(command.group, [...(groups.get(command.group) ?? []), command]);
  return (
    <article className="help-article help-commands">
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
