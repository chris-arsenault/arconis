import {
  BringToFront,
  SendToBack,
  Copy,
  Group,
  Ungroup,
  Trash2,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import type { EditorController } from "../editor/controller";
import { isLink, typeLabel, type Item } from "../document/types";
import { useCollaborativeText } from "./useCollaborativeText";
import { effectiveAppearance } from "../document/appearance";
import { hasSubtitle, hasText } from "../document/capabilities";
import { ConnectionControls } from "./ConnectionControls";
import { StyleControls, GeometryControls } from "./ObjectProperties";
import { AlignControls, ScreenSizeControl, TopicControls } from "./TopicControls";
import { CommentControls } from "./CommentControls";
import { SlideControls } from "./SlideControls";
import { deckOf, decks } from "../document/slides";
import { MarkdownTools } from "./MarkdownTools";
import { TextProperties } from "./TextProperties";
import { markdownKey } from "../text/sourceKeys";
import { fitText } from "../editor/textLayout";
import { useCompletedField } from "./useCompletedField";
import type { CompletedActions } from "../document/actions";
import type { CanvasDocument } from "../document/canvasDocument";
import {
  addComment,
  deleteComment,
  groupThreads,
  listComments,
  setResolved,
} from "../document/comments";
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
  changeGeometry,
  changeSelectionLook,
  changeSelectionStyle,
  changeTemplate,
  editSource,
  routeAround,
} from "../editor/commands";

type ItemProps = Readonly<{ editor: EditorController; item: Item }>;

export function Inspector({
  editor,
  author,
}: Readonly<{ editor: EditorController; author: string }>) {
  const selected = editor.selected();
  const item = selected[0];
  const several = selected.length > 1;
  const showText = !several && item && hasText(item);
  const actions = useSelectionActions(editor);
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
        <SelectionActions selected={selected} actions={actions} />
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
      {!several && <SingleItemControls editor={editor} item={item} author={author} />}
    </aside>
  );
}

function useSelectionActions(editor: EditorController) {
  return useMemo(
    () => ({
      connect: () => editor.connect(),
      group: () => editor.group(),
      ungroup: () => editor.ungroup(),
      front: () => editor.stack("front"),
      back: () => editor.stack("back"),
      duplicate: () => editor.duplicate(),
      remove: () => editor.remove(),
    }),
    [editor]
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
function SingleItemControls({ editor, item, author }: ItemProps & Readonly<{ author: string }>) {
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
      <CommentControls
        threads={groupThreads(listComments(canvas), item.id)}
        onAdd={(text, thread = "") => addComment(canvas, { on: item.id, author, text, thread })}
        onDelete={(id) => deleteComment(canvas, id)}
        onResolve={(id, resolved) => setResolved(canvas, id, resolved)}
      />
    </>
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

function SelectionActions({
  actions,
  selected,
}: Readonly<{
  actions: {
    connect: () => void;
    group: () => void;
    ungroup: () => void;
    front: () => void;
    back: () => void;
    duplicate: () => void;
    remove: () => void;
  };
  selected: Item[];
}>) {
  return (
    <div className="selection-actions" role="toolbar" aria-label="Selection actions">
      <ActionButton
        label="Connect"
        icon={Link2}
        onClick={actions.connect}
        disabled={selected.length !== 2}
      />
      <ActionButton
        label="Group"
        icon={Group}
        onClick={actions.group}
        disabled={selected.length < 2}
      />
      <ActionButton
        label="Ungroup"
        icon={Ungroup}
        onClick={actions.ungroup}
        disabled={!selected.some((value) => value.type === "group")}
      />
      <ActionButton label="To front" icon={BringToFront} onClick={actions.front} />
      <ActionButton label="To back" icon={SendToBack} onClick={actions.back} />
      <ActionButton label="Duplicate" icon={Copy} onClick={actions.duplicate} />
      <ActionButton label="Delete selection" icon={Trash2} tone="danger" onClick={actions.remove} />
    </div>
  );
}
