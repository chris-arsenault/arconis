import { useSyncExternalStore } from "react";
import { MessageSquare, MoreHorizontal } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { runCommand, showComments } from "../editor/registry";
import { openMenuOverSelection } from "../editor/contextMenu";
import { isLink, typeLabel, type Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { hasSubtitle, hasText } from "../document/capabilities";
import { ConnectionControls } from "./ConnectionControls";
import { LayerField } from "./LayersPanel";
import { StyleControls, GeometryControls } from "./ObjectProperties";
import { AlignControls, Relationships, ScreenSizeControl } from "./TopicControls";
import { itemName } from "../editor/relate";
import { NumberBranchesToggle, StateToggles, StatusFields } from "./FieldControls";
import { PropertiesControls } from "./PropertiesControls";
import { SlideControls } from "./SlideControls";
import { followLink } from "../editor/links";
import { deckOf, decks, isSlide } from "../document/slides";
import { TextProperties } from "./TextProperties";
import { fitText } from "../editor/textLayout";
import { ObjectText, SubtitleField } from "./InspectorText";
import { groupThreads, listComments } from "../document/comments";
import { jumpTo } from "../editor/topics";
import {
  changeFields,
  changeGeometry,
  changeSelectionLook,
  changeSelectionStyle,
  changeTemplate,
  routeAround,
} from "../editor/commands";
import { addTags, removeTag, roomTags, sharedTags } from "../editor/tags";
import { RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";
import { TagEditor } from "./TagEditor";
import { alignSelection, distributeSelection } from "../editor/topics";

/**
 * The property panel, in one order for everything: what it is, how it relates to other things,
 * its tags and status, how it looks, where it sits, and its comments. Sections that do not
 * apply are left out, and each folds and stays folded on this device.
 */
const PANEL_DEFAULTS = {
  source: false,
  relations: true,
  tags: true,
  appearance: true,
  layout: true,
  slide: true,
  comments: true,
};

type Sections = ReturnType<typeof useRailSections>;
type PanelProps = Readonly<{ editor: EditorController; selected: Item[]; sections: Sections }>;

export function Inspector({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const sections = useRailSections(PANEL_DEFAULTS, "arconis.inspector");
  const selected = editor.selected();
  const [item] = selected;
  if (!item) return null;
  const single = selected.length === 1;
  const selectionKey = ids(selected).join(" ");
  const props = { editor, selected, sections };
  return (
    <aside className="inspector" aria-label="Object properties">
      <InspectorHeader editor={editor} selected={selected} />
      <PrimaryControls key={selectionKey} {...props} />
      <LayerField editor={editor} selected={selected} />
      <AppearanceSection key={`appearance ${selectionKey}`} {...props} />
      <LayoutSection key={`layout ${selectionKey}`} {...props} />
      <RelationsSection {...props} />
      <TagsSection key={`tags ${selectionKey}`} {...props} />
      {single && !isSlide(item) && (
        <CommentsSection
          key={`comments ${selectionKey}`}
          editor={editor}
          item={item}
          sections={sections}
        />
      )}
      {single && item.editedBy !== undefined && item.editedAt !== undefined && (
        <p className="edited-by" data-testid="edited-by">
          Last edited by {item.editedBy}, {new Date(item.editedAt).toLocaleString()}
        </p>
      )}
    </aside>
  );
}

function PrimaryControls(props: PanelProps) {
  if (props.selected.length !== 1) return null;
  const item = props.selected[0];
  const { editor, sections } = props;
  return (
    <>
      <Content editor={editor} item={item} sections={sections} />
      {isSlide(item) && (
        <>
          <SlideSection editor={editor} item={item} sections={sections} />
          <CommentsSection editor={editor} item={item} sections={sections} />
        </>
      )}
      {isLink(item) && <ConnectionSection {...props} />}
    </>
  );
}

/** What is selected, its name (a click edits it on the canvas), and the rest of the commands. */
function InspectorHeader({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [item] = selected;
  const several = selected.length > 1;
  return (
    <header className="inspector-header">
      <div className="inspector-heading">
        <span className="inspector-kind" data-testid="selection-count">
          {several ? `${selected.length} objects` : typeLabel(item)}
        </span>
        {!several && hasText(item) && (
          <button
            className="inspector-name"
            data-hint="Edit text on the canvas (Enter)"
            onClick={() => runCommand(editor, "edit.text")}
          >
            {item.name.trim() ? itemName(item) : "Add text"}
          </button>
        )}
      </div>
      <button
        className="text-action inspector-more"
        data-hint="Every command for the selection"
        onClick={() => openMenuOverSelection(editor)}
      >
        <MoreHorizontal size={14} /> More
      </button>
    </header>
  );
}

/** The subtitle, and the label's Markdown source folded away: the canvas is where text is typed. */
function Content({
  editor,
  item,
  sections,
}: Readonly<{ editor: EditorController; item: Item; sections: Sections }>) {
  const canvas = editor.document;
  return (
    <>
      {hasSubtitle(item) && (
        <SubtitleField
          value={item.subtitle}
          actions={canvas.actions}
          onChange={(subtitle) => canvas.patch(item.id, { subtitle })}
        />
      )}
      {hasText(item) && (
        <RailSection
          id="source"
          title="Edit source"
          open={sections.open.source}
          onToggle={sections.toggle}
          className="source-section"
        >
          <ObjectText editor={editor} item={item} />
        </RailSection>
      )}
    </>
  );
}

function RelationsSection({ editor, selected, sections }: PanelProps) {
  if (selected.length > 2) return null;
  const canvas = editor.document;
  const items = canvas.list();
  return (
    <RailSection
      id="relations"
      title="Relationships"
      open={sections.open.relations}
      onToggle={sections.toggle}
    >
      <Relationships
        selected={selected}
        items={items}
        run={(id) => runCommand(editor, id)}
        onJump={(id) => jumpTo(editor, id)}
        onRemove={(id) => canvas.remove([id])}
        appearance={(target) => effectiveAppearance(target, canvas.namedStyle(target.style))}
      >
        <NumberBranchesToggle
          selected={selected}
          items={items}
          onChange={(values) => changeFields(canvas, ids(selected), values)}
        />
      </Relationships>
    </RailSection>
  );
}

const ids = (items: Item[]) => items.map((item) => item.id);

function TagsSection({ editor, selected, sections }: PanelProps) {
  const canvas = editor.document;
  const tags = sharedTags(selected);
  return (
    <RailSection
      id="tags"
      title="Tags and status"
      count={tags.length}
      open={sections.open.tags}
      onToggle={sections.toggle}
    >
      <TagEditor
        tags={tags}
        known={roomTags(canvas.list()).map(({ tag }) => tag)}
        onAdd={(added) => addTags(canvas, selected, added)}
        onRemove={(tag) => removeTag(canvas, selected, tag)}
        focusOnOpen={false}
        onDone={() => undefined}
      />
      <StatusFields
        selected={selected}
        onChange={(values) => changeFields(canvas, ids(selected), values)}
        onFollow={(link) => followLink(editor, link)}
      />
      {selected.length === 1 && (
        <PropertiesControls
          item={selected[0]}
          onChange={(properties) => changeFields(canvas, [selected[0].id], { properties })}
        />
      )}
    </RailSection>
  );
}

function AppearanceSection({ editor, selected, sections }: PanelProps) {
  const canvas = editor.document;
  const [item] = selected;
  const textItems = selected.filter(hasText);
  const drawn = (target: Item) => effectiveAppearance(target, canvas.namedStyle(target.style));
  return (
    <RailSection
      id="appearance"
      title="Appearance"
      open={sections.open.appearance}
      onToggle={sections.toggle}
    >
      <StyleControls
        item={item}
        names={[...canvas.styles.keys()].sort((a, b) => a.localeCompare(b))}
        drawn={drawn(item)}
        appearances={selected.map(drawn)}
        mixedStyle={!selected.every((target) => target.style === item.style)}
        change={(look) => changeSelectionLook(canvas, selected, look)}
        onStyle={(style) => changeSelectionStyle(canvas, selected, style)}
      >
        <TextProperties
          selected={textItems}
          drawn={textItems.map(drawn)}
          change={(look) => changeSelectionLook(canvas, textItems, look, true)}
          onFit={() => textItems.forEach((target) => void fitText(canvas, target.id))}
        />
      </StyleControls>
    </RailSection>
  );
}

function ConnectionSection({ editor, selected }: PanelProps) {
  const [item] = selected;
  const canvas = editor.document;
  return (
    <section className="inspector-primary" aria-label="Connection">
      <ConnectionControls
        item={item}
        look={effectiveAppearance(item, canvas.namedStyle(item.style))}
        onLook={(look) => changeSelectionLook(canvas, [item], look)}
        onRoute={() => routeAround(canvas, item)}
      />
    </section>
  );
}

function LayoutSection({ editor, selected, sections }: PanelProps) {
  const canvas = editor.document;
  const [item] = selected;
  const single = selected.length === 1;
  const look = effectiveAppearance(item, canvas.namedStyle(item.style));
  return (
    <RailSection id="layout" title="Layout" open={sections.open.layout} onToggle={sections.toggle}>
      {single && !isLink(item) && item.type !== "drawing" && (
        <GeometryControls
          item={item}
          rotation={look.rotation}
          onGeometry={(key, value) => changeGeometry(editor, item, key, value)}
          onRotate={(rotation) => changeSelectionLook(canvas, [item], { rotation })}
        />
      )}
      <AlignControls
        selected={selected}
        onAlign={(mode) => alignSelection(editor, mode)}
        onDistribute={(axis) => distributeSelection(editor, axis)}
      />
      {single && (
        <ScreenSizeControl
          item={item}
          onSize={(width, height) => editor.updateGeometry(item.id, { width, height })}
        />
      )}
      <StateToggles
        selected={selected}
        items={canvas.list()}
        onChange={(values) => changeFields(canvas, ids(selected), values)}
      />
    </RailSection>
  );
}

function SlideSection({
  editor,
  item,
  sections,
}: Readonly<{ editor: EditorController; item: Item; sections: Sections }>) {
  const canvas = editor.document;
  return (
    <RailSection
      id="slide"
      title="Slide"
      open={sections.open.slide}
      onToggle={sections.toggle}
      className="slide-section"
    >
      <SlideControls
        item={item}
        actions={canvas.actions}
        names={decks(canvas.list()).map(({ deck }) => deck)}
        onDeck={(deck) => canvas.patch(item.id, { deck: deck || undefined })}
        onNumber={(slide) => canvas.patch(item.id, { slide })}
        onTemplate={(template) => changeTemplate(canvas, item, template)}
        onSize={(width, height) => editor.updateGeometry(item.id, { width, height })}
        onPresent={() => editor.presenter.start(deckOf(item), item.id)}
      />
    </RailSection>
  );
}

/** Comments open in a modal above the object; the panel says how many and opens them. */
function CommentsSection({
  editor,
  item,
  sections,
}: Readonly<{ editor: EditorController; item: Item; sections: Sections }>) {
  const threads = groupThreads(listComments(editor.document), item.id);
  const open = threads.filter((thread) => !thread.root.resolved).length;
  const slide = isSlide(item);
  const heading = slide ? "Speaker notes" : "Comments";
  const empty = slide ? "Add speaker notes" : "Add a comment";
  const label = threads.length
    ? `${heading} (${open} open, ${threads.length - open} resolved)`
    : empty;
  return (
    <RailSection
      id="comments"
      title={slide ? "Speaker notes" : "Comments"}
      count={open}
      open={sections.open.comments}
      onToggle={sections.toggle}
    >
      <button className="text-action" onClick={() => showComments(editor, item.id)}>
        <MessageSquare size={14} /> {label}
      </button>
    </RailSection>
  );
}
