import type { EditorController } from "../editor/controller";
import { flyToView, removeView, renameView, saveCurrentView, savedViews } from "../editor/views";
import { historyEntries } from "../editor/history";
import { roomTags } from "../editor/tags";
import { toggled } from "../editor/filter";
import { showFilter } from "../editor/ui";
import { SavedViews } from "./SavedViews";
import { OutlinePanel } from "./OutlinePanel";
import { HistoryPanel } from "./HistoryPanel";
import { PanelHeading, RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";

const SECTION_DEFAULTS = {
  outline: true,
  tags: true,
  history: false,
  views: true,
};
type Sections = ReturnType<typeof useRailSections>;

/** Ways around the document: saved views, the outline, tags and the history of changes. */
export function NavigatePanel({ editor }: Readonly<{ editor: EditorController }>) {
  const sections = useRailSections(SECTION_DEFAULTS);
  const history = historyEntries(editor.document);
  const steps = history.undo.length + history.redo.length;
  const views = savedViews(editor.document);
  return (
    <>
      <PanelHeading title="Navigate this canvas">
        Return to a saved place or find related ideas.
      </PanelHeading>
      <RailSection
        id="views"
        title="Saved views"
        count={views.length}
        detail="Positions and zoom levels saved for everyone in this room."
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
          detail="Your recent changes, which you can undo or redo back to any step."
          open={sections.open.history}
          onToggle={sections.toggle}
        >
          <HistoryPanel editor={editor} />
        </RailSection>
      )}
    </>
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
      detail="Every tag used in this room, with how many objects carry it."
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
              data-hint-detail="Filter the canvas to objects with this tag; choose it again to drop it."
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
