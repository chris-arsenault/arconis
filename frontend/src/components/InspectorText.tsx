import type { EditorController } from "../editor/controller";
import type { CompletedActions } from "../document/actions";
import type { Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { hasSubtitle, hasText } from "../document/capabilities";
import { RailSection } from "./RailSection";
import type { useRailSections } from "./useRailSections";
import { editSource } from "../editor/commands";
import { fitText } from "../editor/textLayout";
import { markdownKey } from "../text/sourceKeys";
import { MarkdownTools } from "./MarkdownTools";
import { useCollaborativeText } from "./useCollaborativeText";
import { useCompletedField } from "./useCompletedField";
import { CanvasObjectLink } from "./CanvasObjectLink";

/** Canonical editor binding; display-only Markdown controls receive commands. */
export function ObjectText({ editor, item }: Readonly<{ editor: EditorController; item: Item }>) {
  const canvas = editor.document;
  const textRef = useCollaborativeText(canvas, item.id);
  return (
    <>
      <textarea
        ref={textRef}
        className="object-text"
        aria-label="Object text"
        data-hint-detail="The Markdown behind this object's text; edits show on the canvas for everyone."
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
        compact={false}
        objectLink={<CanvasObjectLink editor={editor} sourceId={item.id} textarea={textRef} />}
      />
    </>
  );
}

export function SubtitleField({
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
      data-hint-detail="A second line of plain text drawn under the object's bold name."
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

/** The subtitle, and the label's Markdown source folded away: the canvas is where text is typed. */
export function InspectorContent({
  editor,
  item,
  sections,
}: Readonly<{
  editor: EditorController;
  item: Item;
  sections: ReturnType<typeof useRailSections>;
}>) {
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
          count={0}
          title="Edit source"
          detail="Show or hide the object's text as editable source, Markdown included."
          open={sections.open.source}
          onToggle={sections.toggle}
        >
          <ObjectText editor={editor} item={item} />
        </RailSection>
      )}
    </>
  );
}
