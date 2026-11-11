import type { EditorController } from "../editor/controller";
import { X } from "lucide-react";
import { typeLabel } from "../document/types";
import { changeFields } from "../editor/commands";
import { jumpTo } from "../editor/topics";
import { historyEntries } from "../editor/history";
import { roomTags } from "../editor/tags";
import { toggled } from "../editor/filter";
import { showFilter } from "../editor/ui";
import { OutlinePanel } from "./OutlinePanel";
import { HistoryPanel } from "./HistoryPanel";
import { PanelHeading, RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";

const SECTION_DEFAULTS = {
  outline: true,
  tags: true,
  history: false,
  jumps: true,
};
type Sections = ReturnType<typeof useRailSections>;

/** Ways around the document: jump points, the outline, tags and the history of changes. */
export function NavigatePanel({ editor }: Readonly<{ editor: EditorController }>) {
  const sections = useRailSections(SECTION_DEFAULTS);
  const history = historyEntries(editor.document);
  const steps = history.undo.length + history.redo.length;
  return (
    <>
      <PanelHeading title="Navigate this canvas">
        Return to a marked object or find related ideas.
      </PanelHeading>
      <JumpPoints editor={editor} sections={sections} />
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

/** The objects marked as jump points, by name; choosing one flies to it and selects it. */
function JumpPoints({
  editor,
  sections,
}: Readonly<{ editor: EditorController; sections: Sections }>) {
  const points = editor.document.list().filter((item) => item.jump);
  const selected = editor.selected().filter((item) => !item.jump);
  const mark = (ids: string[], jump: boolean) => changeFields(editor.document, ids, { jump });
  return (
    <RailSection
      id="jumps"
      title="Jump points"
      count={points.length}
      detail="Objects marked for everyone in this room to fly back to."
      open={sections.open.jumps}
      onToggle={sections.toggle}
    >
      <p className="rail-description">
        Mark an object as a jump point and it is listed here for everyone in this room.
      </p>
      <button
        className="text-action"
        disabled={!selected.length}
        data-hint="Mark the selection as a jump point"
        data-hint-detail="List the selected objects here, so anyone in the room can fly to them."
        onClick={() =>
          mark(
            selected.map((item) => item.id),
            true
          )
        }
      >
        Mark selection
      </button>
      <div className="rail-list jump-points">
        {points.map((item) => {
          const name = item.name.split("\n")[0] || typeLabel(item);
          return (
            <div className="rail-row" key={item.id}>
              <button
                className="rail-entry"
                data-hint={`Go to ${name}`}
                data-hint-detail="Move your view to this object and select it."
                onClick={() => jumpTo(editor, item.id)}
              >
                {name}
              </button>
              <button
                className="rail-action"
                aria-label={`Remove jump point ${name}`}
                data-hint="Remove this jump point"
                data-hint-detail="Take this object off the list for everyone; the object itself stays."
                onClick={() => mark([item.id], false)}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </RailSection>
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
