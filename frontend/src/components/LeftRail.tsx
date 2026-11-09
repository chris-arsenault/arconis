import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Compass, Pencil, Play, Plus, Shapes, Presentation } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { Item } from "../document/types";
import { decks, isTemplate, type Deck } from "../document/slides";
import { goToSlide } from "../editor/topics";
import { flyToView, removeView, renameView, saveCurrentView, savedViews } from "../editor/views";
import { SavedViews } from "./SavedViews";
import { StencilBrowser } from "./StencilBrowser";
import { OutlinePanel } from "./OutlinePanel";
import { HistoryPanel } from "./HistoryPanel";
import { TOOLS } from "./stencils";
import { DrawingTools, type DrawingActions } from "./DrawingTools";
import { isMarkup } from "../document/ink";
import { RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";
import { historyEntries } from "../editor/history";
import { roomTags } from "../editor/tags";
import { toggled } from "../editor/filter";
import { showFilter } from "../editor/registry";

const TOOL_NAMES: Record<string, string> = { select: "Select", pan: "Pan", connect: "Connect" };
const SECTION_DEFAULTS = {
  outline: true,
  tags: true,
  history: false,
  views: true,
};

type Sections = ReturnType<typeof useRailSections>;
type Panel = "add" | "draw" | "explore" | "slides";
const PANELS = [
  { id: "add", label: "Add", icon: Shapes },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "slides", label: "Slides", icon: Presentation },
] as const;

/** Tool shortcuts open their controls; selection after placement or a lasso keeps that panel. */
function usePanel(
  editor: EditorController,
  compact: boolean,
  shown: boolean | undefined,
  onExpand?: (open: boolean) => void
) {
  const [state, setState] = useState<{ panel: Panel; tool: string; expanded: boolean }>(() => ({
    panel: "add",
    tool: "select",
    expanded: !compact,
  }));
  useEffect(() => {
    if (compact && !["select", "pan", "connect", "draw"].includes(editor.tool)) onExpand?.(false);
  }, [compact, editor.tool, onExpand]);
  if (state.tool !== editor.tool) {
    let panel = state.panel;
    const creating = !["select", "pan", "connect"].includes(editor.tool);
    if (editor.tool === "draw") panel = "draw";
    else if (editor.tool === "slide") panel = "slides";
    else if (creating) panel = "add";
    setState({ panel, tool: editor.tool, expanded: state.expanded || creating });
  }
  const choose = (panel: Panel) => {
    if (panel === "draw") editor.setTool("draw");
    else {
      editor.drawing.leave();
      editor.setTool("select");
    }
    setState({ panel, tool: editor.tool, expanded: true });
    onExpand?.(true);
  };
  const expanded = shown ?? state.expanded;
  const toggle = () => {
    setState({ ...state, expanded: !expanded });
    onExpand?.(!expanded);
  };
  return { panel: state.panel, expanded, choose, toggle };
}

export function LeftRail({
  editor,
  compact = false,
  expanded: shown,
  onExpand,
}: Readonly<{
  editor: EditorController;
  compact?: boolean;
  expanded?: boolean;
  onExpand?: (open: boolean) => void;
}>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const sections = useRailSections(SECTION_DEFAULTS);
  const { panel, expanded, choose, toggle } = usePanel(editor, compact, shown, onExpand);
  return (
    <aside className="left-rail" aria-label="Tools and stencils" data-expanded={expanded}>
      <div className="tool-row" role="toolbar" aria-label="Canvas tools">
        {TOOLS.filter((tool) => tool.id !== "draw").map((tool) => (
          <button
            key={tool.id}
            data-hint={tool.label}
            data-hint-detail="Select and move objects, pan the view, or connect two objects."
            aria-label={tool.label}
            aria-pressed={editor.tool === tool.id}
            className="tool"
            onClick={() => editor.setTool(tool.id)}
          >
            <tool.icon size={17} />
            <span>{TOOL_NAMES[tool.id]}</span>
          </button>
        ))}
      </div>
      <nav className="rail-tabs" aria-label="Workspace panels">
        {PANELS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={id === "draw" ? "Draw (P)" : label}
            aria-pressed={panel === id}
            aria-controls="rail-content"
            data-hint={id === "draw" ? "Draw (P)" : label}
            onClick={() => choose(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button className="rail-collapse" aria-expanded={expanded} onClick={toggle}>
        {expanded ? "Hide panel" : "Show panel"}
      </button>
      <div className="rail-content" id="rail-content">
        {panel === "add" && <StencilBrowser editor={editor} />}
        {panel === "draw" && <DrawingSection editor={editor} />}
        {panel === "explore" && <ExploreSection editor={editor} sections={sections} />}
        {panel === "slides" && <SlidesSection editor={editor} />}
      </div>
    </aside>
  );
}

function DrawingSection({ editor }: Readonly<{ editor: EditorController }>) {
  const selected = editor.selected();
  const selection = {
    canPromote: selected.some((item) => item.type === "drawing" && isMarkup(item)),
    hasDrawing: !!editor.drawing.activeSketch || selected.some((item) => item.type === "sketch"),
    strokes: selected.filter((item) => item.type === "drawing").length,
  };
  return (
    <section aria-label="Drawing" className="drawing-section">
      <PanelHeading title={editor.drawing.activeSketch ? "Edit drawing" : "Draw and annotate"}>
        {editor.drawing.activeSketch
          ? "Ink stays inside this drawing object."
          : "Draw shared annotations over the canvas."}
      </PanelHeading>
      <DrawingTools
        activeSketch={editor.drawing.activeSketch}
        settings={editor.drawing.settings}
        visible={editor.drawing.visible}
        favorites={editor.drawing.favorites}
        recent={editor.drawing.recent}
        selection={selection}
        markupCount={editor.document.list().filter(isMarkup).length}
        actions={drawingActions(editor)}
      />
    </section>
  );
}

function PanelHeading({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className="rail-heading">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function ExploreSection({
  editor,
  sections,
}: Readonly<{ editor: EditorController; sections: Sections }>) {
  const history = historyEntries(editor.document);
  const steps = history.undo.length + history.redo.length;
  const views = savedViews(editor.document);
  return (
    <>
      <PanelHeading title="Explore this canvas">
        Return to a saved place or find related ideas.
      </PanelHeading>
      <RailSection
        id="views"
        title="Saved views"
        count={views.length}
        open={sections.open.views}
        onToggle={sections.toggle}
      >
        <p className="rail-description">
          Save the current position and zoom for everyone in this room.
        </p>
        <SavedViews
          views={views}
          onGo={(view) => flyToView(editor.graph, editor.element, view)}
          onRemove={(id) => removeView(editor.document, id)}
          onRename={(view, name) => renameView(editor.document, view, name)}
          onSave={(name) => saveCurrentView(editor, name)}
        />
      </RailSection>
      <OutlinePanel editor={editor} open={sections.open.outline} onToggle={sections.toggle} />
      <TagsSection editor={editor} sections={sections} />
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
    </>
  );
}

function SlidesSection({ editor }: Readonly<{ editor: EditorController }>) {
  const all = decks(editor.document.list());
  return (
    <section aria-label="Slide decks">
      <PanelHeading title="Slides and presenting">
        Frame parts of the canvas and present them in order.
      </PanelHeading>
      <div className="rail-panel-actions">
        <button aria-pressed={editor.tool === "slide"} onClick={() => editor.setTool("slide")}>
          <Plus size={16} /> Add slide
        </button>
        <p className="rail-description">
          {editor.tool === "slide"
            ? "Click the canvas to place a slide."
            : "Select a slide to set its deck, size and speaker notes."}
        </p>
      </div>
      {all.length ? (
        <Decks
          all={all}
          onPresent={(deck) => editor.presenter.start(deck)}
          onGo={(id) => goToSlide(editor, id)}
        />
      ) : (
        <p className="rail-empty">
          No slides yet. Add a slide around the content you want to present.
        </p>
      )}
    </section>
  );
}

/** Every tag in the room with its count; choosing one filters the canvas to what carries it. */
function TagsSection({
  editor,
  sections,
}: Readonly<{ editor: EditorController; sections: Sections }>) {
  const tags = roomTags(editor.document.list());
  if (!tags.length) return null;
  const choose = (tag: string) => {
    if (!editor.ui.filter) showFilter(editor, true);
    editor.setFilter(toggled(editor.filter, "tags", tag));
  };
  return (
    <RailSection
      id="tags"
      title="Tags"
      count={tags.length}
      open={sections.open.tags}
      onToggle={sections.toggle}
    >
      <div className="rail-list tag-list">
        {tags.map(({ tag, count }) => (
          <div className="rail-row" key={tag}>
            <button
              className="rail-entry"
              aria-pressed={editor.filter.tags.includes(tag)}
              data-hint={`Show only what is tagged #${tag}`}
              onClick={() => choose(tag)}
            >
              #{tag}
            </button>
            <span className="rail-count">{count}</span>
          </div>
        ))}
      </div>
    </RailSection>
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
              data-hint={`Present ${deck}`}
              aria-label={`Present ${deck}`}
              onClick={() => onPresent(deck)}
            >
              <Play size={13} /> Present
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
