import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { typedTags } from "../editor/tags";

const SUGGESTION_LIMIT = 6;

interface Props {
  tags: string[];
  /** Tags already in the room, most used first, offered as suggestions. */
  known: string[];
  onAdd: (tags: string[]) => void;
  onRemove: (tag: string) => void;
  /** Whether the field takes focus when it appears, as it does floating over the canvas. */
  focusOnOpen: boolean;
  /** Escape, or Enter on an empty field: the floating editor closes; the panel's ignores it. */
  onDone: () => void;
}

/** What a key does in the tag field: commit the word, remove the last chip, or finish. */
function handleKey(
  event: KeyboardEvent<HTMLInputElement>,
  text: string,
  { tags, onRemove, onDone }: Pick<Props, "tags" | "onRemove" | "onDone">,
  commit: () => boolean
) {
  event.stopPropagation();
  const actions: Record<string, () => boolean> = {
    Enter: () => commit() || (onDone(), true),
    ",": () => (commit(), true),
    " ": () => Boolean(text.trim()) && (commit(), true),
    Escape: () => (onDone(), true),
  };
  if (actions[event.key]?.()) event.preventDefault();
  else if (event.key === "Backspace" && !text && tags.length) onRemove(tags[tags.length - 1]);
}

function Suggestions({
  tags,
  known,
  typed,
  onAdd,
}: Readonly<{ tags: string[]; known: string[]; typed: string; onAdd: (tags: string[]) => void }>) {
  const shown = known
    .filter((tag) => !tags.includes(tag) && (!typed || tag.toLowerCase().startsWith(typed)))
    .slice(0, SUGGESTION_LIMIT);
  if (!shown.length) return null;
  return (
    <div className="tag-suggestions" role="group" aria-label="Tags in this room">
      {shown.map((tag) => (
        <button
          type="button"
          key={tag}
          className="tag-suggestion"
          data-hint-detail="Add this tag, already used in the room, to the selected objects."
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAdd([tag])}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

/**
 * Tags as chips: type a word and press Enter, comma or space to add it, pick one the room already
 * uses, or remove one with its cross. Backspace in the empty field removes the last chip.
 */
export function TagEditor(props: Readonly<Props>) {
  const { tags, known, onAdd, onRemove, focusOnOpen } = props;
  const [text, setText] = useState("");
  const commit = () => {
    const parsed = typedTags(text);
    if (parsed.length) onAdd(parsed);
    setText("");
    return parsed.length > 0;
  };
  return (
    <div className="tag-editor">
      <div className="tag-chips">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              data-hint-detail="Take this tag off every selected object."
              onClick={() => onRemove(tag)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          aria-label="Add a tag"
          data-hint-detail="Type a word and press Enter, comma or space to tag the selected objects."
          placeholder={tags.length ? "Add tag" : "Add a tag"}
          value={text}
          // The floating tag editor opens to type straight away.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={focusOnOpen}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => handleKey(event, text, props, commit)}
          onBlur={() => {
            if (text.trim()) commit();
          }}
        />
      </div>
      <Suggestions
        tags={tags}
        known={known}
        typed={text.trim().replace(/^#/, "").toLowerCase()}
        onAdd={onAdd}
      />
    </div>
  );
}
