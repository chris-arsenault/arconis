import {
  BringToFront,
  SendToBack,
  Copy,
  Group,
  Ungroup,
  Trash2,
  Link2,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import {
  commandContext,
  findCommand,
  isAvailable,
  runCommand,
  showComments,
} from "../editor/registry";
import { isLink, typeLabel, type Item } from "../document/types";
import { useCollaborativeText } from "./useCollaborativeText";
import { effectiveAppearance } from "../document/appearance";
import { hasSubtitle, hasText } from "../document/capabilities";
import { ConnectionControls } from "./ConnectionControls";
import { StyleControls, GeometryControls } from "./ObjectProperties";
import { AlignControls, ScreenSizeControl, TopicControls } from "./TopicControls";
import { FieldControls } from "./FieldControls";
import { PropertiesControls } from "./PropertiesControls";
import { Section } from "./ConnectionControls";
import { SlideControls } from "./SlideControls";
import { followLink } from "../editor/links";
import { deckOf, decks } from "../document/slides";
import { MarkdownTools } from "./MarkdownTools";
import { TextProperties } from "./TextProperties";
import { markdownKey } from "../text/sourceKeys";
import { fitText } from "../editor/textLayout";
import { useCompletedField } from "./useCompletedField";
import type { CompletedActions } from "../document/actions";
import type { CanvasDocument } from "../document/canvasDocument";
import { groupThreads, listComments } from "../document/comments";
import {
  addBranch,
  addReference,
  alignSelection,
  distributeSelection,
  jumpTo,
  tidySelection,
  zoomIntoSelection,
} from "../editor/topics";
import {
  changeFields,
  changeGeometry,
  changeSelectionLook,
  changeSelectionStyle,
  changeTemplate,
  editSource,
  routeAround,
} from "../editor/commands";

type ItemProps = Readonly<{ editor: EditorController; item: Item }>;

export function Inspector({ editor }: Readonly<{ editor: EditorController }>) {
  const selected = editor.selected();
  const item = selected[0];
  const several = selected.length > 1;
  const showText = !several && item && hasText(item);
  if (!item) return null;
  const canvas = editor.document;
  const textItems = selected.filter(hasText);
  const drawn = selected.map((selected) =>
    effectiveAppearance(selected, canvas.namedStyle(selected.style))
  );
  return (
    <aside className="inspector" aria-label="Object properties">
      <header className="inspector-header">
        <strong data-testid="selection-count">
          {several ? `${selected.length} objects` : typeLabel(item)}
        </strong>
        <SelectionActions editor={editor} />
      </header>
      {showText && <ObjectText canvas={canvas} item={item} />}
      <TopicControls
        selected={selected}
        items={canvas.list()}
        onBranch={() => addBranch(editor)}
        onReference={() => addReference(editor)}
        onZoom={() => zoomIntoSelection(editor)}
        onTidy={() => tidySelection(editor)}
        onJump={(id) => jumpTo(editor, id)}
        onRemove={(id) => canvas.remove([id])}
      />
      <AlignControls
        selected={selected}
        onAlign={(mode) => alignSelection(editor, mode)}
        onDistribute={(axis) => distributeSelection(editor, axis)}
      />
      <FieldControls
        selected={selected}
        items={canvas.list()}
        onChange={(values) =>
          changeFields(
            canvas,
            selected.map((item) => item.id),
            values
          )
        }
        onFollow={(link) => followLink(editor, link)}
      />
      <StyleControls
        item={item}
        names={[...canvas.styles.keys()].sort((a, b) => a.localeCompare(b))}
        drawn={drawn[0]}
        change={(look) => changeSelectionLook(canvas, selected, look)}
        onStyle={(style) => changeSelectionStyle(canvas, selected, style)}
      >
        <TextProperties
          selected={textItems}
          drawn={textItems.map((selected) =>
            effectiveAppearance(selected, canvas.namedStyle(selected.style))
          )}
          change={(look) => changeSelectionLook(canvas, textItems, look, true)}
          onFit={() => textItems.forEach((selected) => void fitText(canvas, selected.id))}
        />
      </StyleControls>
      {!several && <SingleItemControls editor={editor} item={item} />}
    </aside>
  );
}

/** This binding is a canonical editor adapter; display-only Markdown controls receive commands. */
function ObjectText({ canvas, item }: Readonly<{ canvas: CanvasDocument; item: Item }>) {
  const textRef = useCollaborativeText(canvas, item.id);
  return (
    <>
      <textarea
        ref={textRef}
        className="object-text"
        aria-label="Object text"
        rows={3}
        onKeyDown={(event) =>
          markdownKey(event, (element, edit) => editSource(canvas, item.id, element, edit))
        }
        onInput={() => void fitText(canvas, item.id, true)}
      />
      <MarkdownTools
        source={item.name}
        appearance={effectiveAppearance(item, canvas.namedStyle(item.style))}
        onEdit={(element, edit) => editSource(canvas, item.id, element, edit)}
        textarea={textRef}
        expanded={false}
      />
    </>
  );
}

/** Controls that only make sense for one item at a time. */
function SingleItemControls({ editor, item }: ItemProps) {
  const canvas = editor.document;
  const look = effectiveAppearance(item, canvas.namedStyle(item.style));
  const onSize = (width: number, height: number) =>
    editor.updateGeometry(item.id, { width, height });
  return (
    <>
      {hasSubtitle(item) && (
        <SubtitleField
          value={item.subtitle}
          actions={canvas.actions}
          onChange={(subtitle) => canvas.patch(item.id, { subtitle })}
        />
      )}
      <SlideControls
        item={item}
        actions={canvas.actions}
        names={decks(canvas.list()).map(({ deck }) => deck)}
        onDeck={(deck) => canvas.patch(item.id, { deck: deck || undefined })}
        onNumber={(slide) => canvas.patch(item.id, { slide })}
        onTemplate={(template) => changeTemplate(canvas, item, template)}
        onSize={onSize}
        onPresent={() => editor.presenter.start(deckOf(item), item.id)}
      />
      {isLink(item) ? (
        <ConnectionControls
          item={item}
          look={look}
          onLook={(look) => changeSelectionLook(canvas, [item], look)}
          onRoute={() => routeAround(canvas, item)}
        />
      ) : (
        item.type !== "drawing" && (
          <GeometryControls
            item={item}
            rotation={look.rotation}
            onGeometry={(key, value) => changeGeometry(editor, item, key, value)}
            onRotate={(rotation) => changeSelectionLook(canvas, [item], { rotation })}
          />
        )
      )}
      <ScreenSizeControl item={item} onSize={onSize} />
      <PropertiesControls
        item={item}
        onChange={(properties) => changeFields(canvas, [item.id], { properties })}
      />
      <CommentsButton editor={editor} item={item} />
    </>
  );
}

/** Comments open in a modal above the object; the panel only says how many and opens them. */
function CommentsButton({ editor, item }: ItemProps) {
  const threads = groupThreads(listComments(editor.document), item.id);
  const open = threads.filter((thread) => !thread.root.resolved).length;
  const label = threads.length
    ? `Comments (${open} open, ${threads.length - open} resolved)`
    : "Add a comment";
  return (
    <Section title="Comments">
      <button className="text-action" onClick={() => showComments(editor, item.id)}>
        <MessageSquare size={14} /> {label}
      </button>
    </Section>
  );
}

function SubtitleField({
  value,
  actions,
  onChange,
}: Readonly<{
  value: string;
  actions: Pick<CompletedActions, "begin">;
  onChange: (value: string) => void;
}>) {
  const edit = useCompletedField(actions);
  return (
    <input
      className="object-subtitle"
      aria-label="Object subtitle"
      placeholder="Subtitle"
      value={value}
      onChange={(event) => {
        edit.start();
        onChange(event.target.value);
      }}
      onBlur={edit.finish}
      onKeyDown={edit.keydown}
    />
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  tone = "",
}: Readonly<
  { label: string; icon: LucideIcon; onClick: () => void } & Partial<{
    disabled: boolean;
    tone: string;
  }>
>) {
  return (
    <button
      className={`icon-action ${tone}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
    </button>
  );
}

/** The header's actions are registry commands; their labels and availability come from there. */
const HEADER_ACTIONS: { id: string; label: string; icon: LucideIcon; tone?: string }[] = [
  { id: "structure.connect", label: "Connect", icon: Link2 },
  { id: "edit.group", label: "Group", icon: Group },
  { id: "edit.ungroup", label: "Ungroup", icon: Ungroup },
  { id: "arrange.front", label: "To front", icon: BringToFront },
  { id: "arrange.back", label: "To back", icon: SendToBack },
  { id: "edit.duplicate", label: "Duplicate", icon: Copy },
  { id: "edit.delete", label: "Delete selection", icon: Trash2, tone: "danger" },
];

function SelectionActions({ editor }: Readonly<{ editor: EditorController }>) {
  const context = commandContext(editor);
  return (
    <div className="selection-actions" role="toolbar" aria-label="Selection actions">
      {HEADER_ACTIONS.map(({ id, label, icon, tone }) => (
        <ActionButton
          key={id}
          label={label}
          icon={icon}
          tone={tone}
          disabled={!isAvailable(findCommand(id), context)}
          onClick={() => runCommand(editor, id)}
        />
      ))}
    </div>
  );
}
