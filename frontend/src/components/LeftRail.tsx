import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pencil, Play, Plus, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { Item, View } from "../document/types";
import { decks, isTemplate, type Deck } from "../document/slides";
import { goToSlide } from "../editor/topics";
import { flyToView, removeView, renameView, saveCurrentView, savedViews } from "../editor/views";
import { StencilBrowser } from "./StencilBrowser";
import { OutlinePanel } from "./OutlinePanel";
import { HistoryPanel } from "./HistoryPanel";
import { TOOLS } from "./stencils";
import { DrawingTools, type DrawingActions } from "./DrawingTools";
import { isMarkup } from "../document/ink";
import { RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";
import { historyEntries } from "../editor/history";

/** The stencils stay in view; every other panel starts open except the history, which is a log. */
const SECTION_DEFAULTS = {
  drawing: true,
  outline: true,
  history: false,
  slides: true,
  views: true,
};

type Sections = ReturnType<typeof useRailSections>;

export function LeftRail({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const sections = useRailSections(SECTION_DEFAULTS);
  const drawing = editor.tool === "draw" || editor.drawing.settings.mode === "lasso";
  const drawingPanel = drawing && <DrawingSection editor={editor} sections={sections} />;
  return (
    <aside className="left-rail" aria-label="Tools and stencils">
      <div className="tool-row" role="toolbar" aria-label="Canvas tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={editor.tool === tool.id}
            className="tool"
            onClick={() => editor.setTool(tool.id)}
          >
            <tool.icon size={17} />
          </button>
        ))}
      </div>
      {/* The draw tool takes the stencils' place; a lasso left active keeps its panel below them. */}
      {editor.tool === "draw" ? drawingPanel : <StencilBrowser editor={editor} />}
      {editor.tool !== "draw" && drawingPanel}
      <OutlinePanel editor={editor} open={sections.open.outline} onToggle={sections.toggle} />
      <DocumentSections editor={editor} sections={sections} />
    </aside>
  );
}

function DrawingSection({
  editor,
  sections,
}: Readonly<{ editor: EditorController; sections: Sections }>) {
  const selected = editor.selected();
  const selection = {
    canPromote: selected.some((item) => item.type === "drawing" && isMarkup(item)),
    hasDrawing: !!editor.drawing.activeSketch || selected.some((item) => item.type === "sketch"),
  };
  return (
    <RailSection
      id="drawing"
      title={editor.drawing.activeSketch ? "Editing drawing" : "Drawing"}
      open={sections.open.drawing}
      onToggle={sections.toggle}
      className="drawing-section"
    >
      <DrawingTools
        activeSketch={editor.drawing.activeSketch}
        settings={editor.drawing.settings}
        visible={editor.drawing.visible}
        favorites={editor.drawing.favorites}
        recent={editor.drawing.recent}
        selection={selection}
        actions={drawingActions(editor)}
      />
    </RailSection>
  );
}

/** The panels about the document itself: its history, its slide decks and its saved views. */
function DocumentSections({
  editor,
  sections,
}: Readonly<{ editor: EditorController; sections: Sections }>) {
  const history = historyEntries(editor.document);
  const steps = history.undo.length + history.redo.length;
  const allDecks = decks(editor.document.list());
  const views = savedViews(editor.document);
  return (
    <>
      {steps > 0 && (
        <RailSection
          id="history"
          title="History"
          count={steps}
          open={sections.open.history}
          onToggle={sections.toggle}
        >
          <HistoryPanel editor={editor} />
        </RailSection>
      )}
      {allDecks.length > 0 && (
        <RailSection
          id="slides"
          title="Slides"
          count={allDecks.reduce((total, deck) => total + deck.slides.length, 0)}
          open={sections.open.slides}
          onToggle={sections.toggle}
        >
          <Decks
            all={allDecks}
            onPresent={(deck) => editor.presenter.start(deck)}
            onGo={(id) => goToSlide(editor, id)}
          />
        </RailSection>
      )}
      <RailSection
        id="views"
        title="Saved views"
        count={views.length}
        open={sections.open.views}
        onToggle={sections.toggle}
      >
        <SavedViews
          views={views}
          onGo={(view) => flyToView(editor.graph, editor.element, view)}
          onRemove={(id) => removeView(editor.document, id)}
          onRename={(view, name) => renameView(editor.document, view, name)}
          onSave={(name) => saveCurrentView(editor, name)}
        />
      </RailSection>
    </>
  );
}

function drawingActions(editor: EditorController): DrawingActions {
  const drawing = editor.drawing;
  return {
    change: (settings) => drawing.update(settings),
    favorite: (index, save) => drawing.favorite(index, save),
    toggle: () => drawing.toggle(),
    clear: () => drawing.clear(),
    recolor: () => drawing.recolor(),
    make: () => drawing.make(),
    blank: () => drawing.make(true),
    fit: () => drawing.fit(),
    demote: () => drawing.demote(),
    leave: () => {
      drawing.leave();
      editor.setTool("select");
    },
    fill: () => drawing.fill(),
    close: () => drawing.close(),
  };
}

/** A slide's line in the rail: its number, or Template, then its name. */
function slideEntry(slide: Item) {
  if (isTemplate(slide)) return slide.name ? `Template · ${slide.name}` : "Template";
  return `${slide.slide ?? 0} · ${slide.name || "Slide"}`;
}

/** Every deck in the room with its slides in order; clicking a slide flies to it. */
function Decks({
  all,
  onPresent,
  onGo,
}: Readonly<{ all: Deck[]; onPresent: (deck: string) => void; onGo: (id: string) => void }>) {
  return (
    <div className="rail-list">
      {all.map(({ deck, slides }) => (
        <div className="deck" key={deck} data-testid="deck">
          <div className="deck-title">
            <span>{deck}</span>
            <button
              className="rail-action deck-present"
              title={`Present ${deck}`}
              aria-label={`Present ${deck}`}
              onClick={() => onPresent(deck)}
            >
              <Play size={13} />
            </button>
          </div>
          {slides.map((slide) => (
            <button key={slide.id} className="rail-entry" onClick={() => onGo(slide.id)}>
              {slideEntry(slide)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SavedViews({
  views,
  onGo,
  onRemove,
  onRename,
  onSave,
}: Readonly<{
  views: View[];
  onGo: (view: View) => void;
  onRemove: (id: string) => void;
  onRename: (view: View, name: string) => void;
  onSave: (name: string) => void;
}>) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState("");
  return (
    <>
      {views.length > 0 && (
        <div className="rail-list">
          {views.map((view) =>
            renaming === view.id ? (
              <RenameView
                key={view.id}
                view={view}
                onRename={(name) => onRename(view, name)}
                onDone={() => setRenaming("")}
              />
            ) : (
              <div className="rail-row" key={view.id}>
                <button className="rail-entry" onClick={() => onGo(view)}>
                  {view.name}
                </button>
                <button
                  className="rail-action"
                  title={`Rename ${view.name}`}
                  aria-label={`Rename view ${view.name}`}
                  onClick={() => setRenaming(view.id)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="rail-action"
                  title={`Remove ${view.name}`}
                  aria-label={`Remove view ${view.name}`}
                  onClick={() => onRemove(view.id)}
                >
                  <X size={13} />
                </button>
              </div>
            )
          )}
        </div>
      )}
      <form
        className="save-view"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name.trim() || `View ${views.length + 1}`);
          setName("");
        }}
      >
        <input
          aria-label="View name"
          placeholder="Name this place"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button aria-label="Save current view" title="Save current view">
          <Plus size={15} />
        </button>
      </form>
    </>
  );
}

function RenameView({
  view,
  onRename,
  onDone,
}: Readonly<{ view: View; onRename: (name: string) => void; onDone: () => void }>) {
  const [name, setName] = useState(view.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const commit = () => {
    if (name.trim()) onRename(name.trim());
    onDone();
  };
  return (
    <form
      className="rail-row"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={input}
        className="rail-rename"
        aria-label={`New name for ${view.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
      />
    </form>
  );
}
