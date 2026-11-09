import type { CanvasDocument } from "../document/canvasDocument";
import type { CompletedActions } from "../document/actions";
import type { Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { editSource } from "../editor/commands";
import { fitText } from "../editor/textLayout";
import { markdownKey } from "../text/sourceKeys";
import { MarkdownTools } from "./MarkdownTools";
import { useCollaborativeText } from "./useCollaborativeText";
import { useCompletedField } from "./useCompletedField";

/** Canonical editor binding; display-only Markdown controls receive commands. */
export function ObjectText({ canvas, item }: Readonly<{ canvas: CanvasDocument; item: Item }>) {
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
        compact={false}
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
