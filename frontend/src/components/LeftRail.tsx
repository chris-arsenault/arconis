import { useEffect, useRef, useState } from "react";
import { Pencil, Play, Plus, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { Item, View } from "../document/types";
import { decks, isTemplate, type Deck } from "../document/slides";
import { goToSlide } from "../editor/topics";
import { flyToView, removeView, renameView, saveCurrentView, savedViews } from "../editor/views";
import { StencilBrowser } from "./StencilBrowser";
import { TOOLS } from "./stencils";

export function LeftRail({ editor }: Readonly<{ editor: EditorController }>) {
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
      <StencilBrowser editor={editor} />
      <Decks
        all={decks(editor.document.list())}
        onPresent={(deck) => editor.presenter.start(deck)}
        onGo={(id) => goToSlide(editor, id)}
      />
      <SavedViews
        views={savedViews(editor.document)}
        onGo={(view) => flyToView(editor.graph, editor.element, view)}
        onRemove={(id) => removeView(editor.document, id)}
        onRename={(view, name) => renameView(editor.document, view, name)}
        onSave={(name) => saveCurrentView(editor, name)}
      />
    </aside>
  );
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
  if (!all.length) return null;
  return (
    <section className="saved-views" aria-label="Slides">
      <h3>Slides</h3>
      {all.map(({ deck, slides }) => (
        <div className="deck" key={deck} data-testid="deck">
          <div className="deck-title">
            <span>{deck}</span>
            <button
              className="saved-view-action deck-present"
              title={`Present ${deck}`}
              aria-label={`Present ${deck}`}
              onClick={() => onPresent(deck)}
            >
              <Play size={13} />
            </button>
          </div>
          <div className="saved-view-list">
            {slides.map((slide) => (
              <button key={slide.id} className="saved-view-name" onClick={() => onGo(slide.id)}>
                {slideEntry(slide)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
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
    <section className="saved-views" aria-label="Saved views">
      <h3>Saved views</h3>
      <div className="saved-view-list">
        {views.map((view) =>
          renaming === view.id ? (
            <RenameView
              key={view.id}
              view={view}
              onRename={(name) => onRename(view, name)}
              onDone={() => setRenaming("")}
            />
          ) : (
            <div className="saved-view" key={view.id}>
              <button className="saved-view-name" onClick={() => onGo(view)}>
                {view.name}
              </button>
              <button
                className="saved-view-action"
                title={`Rename ${view.name}`}
                aria-label={`Rename view ${view.name}`}
                onClick={() => setRenaming(view.id)}
              >
                <Pencil size={12} />
              </button>
              <button
                className="saved-view-action"
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
          placeholder="Save this place"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button aria-label="Save current view" title="Save current view">
          <Plus size={15} />
        </button>
      </form>
    </section>
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
      className="saved-view"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={input}
        aria-label={`New name for ${view.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
      />
    </form>
  );
}
