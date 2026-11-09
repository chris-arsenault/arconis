import { useId, useRef, useState } from "react";

/** A local draft follows peers until edited; a conflicting draft needs an explicit Enter. */
export function PropertyValue({
  name,
  value,
  onCommit,
}: Readonly<{ name: string; value: string; onCommit: (value: string) => void }>) {
  const [draft, setDraft] = useState({ base: value, text: value });
  const handled = useRef(false);
  const feedbackId = useId();
  const dirty = draft.text !== draft.base;
  const conflict = dirty && draft.base !== value;
  const text = dirty ? draft.text : value;
  const commit = (explicit = false) => {
    if (!dirty || (conflict && !explicit)) return;
    onCommit(text);
    setDraft({ base: text, text });
  };
  return (
    <div className="property-draft">
      <input
        className="object-subtitle property-value"
        aria-label={`Value of ${name}`}
        aria-describedby={conflict ? feedbackId : undefined}
        value={text}
        onChange={(event) =>
          setDraft({ base: dirty ? draft.base : value, text: event.target.value })
        }
        onFocus={() => {
          handled.current = false;
        }}
        onBlur={() => {
          if (!handled.current) commit();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            handled.current = true;
            commit(true);
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            handled.current = true;
            setDraft({ base: value, text: value });
            event.currentTarget.blur();
          }
        }}
      />
      {conflict && (
        <small id={feedbackId} role="status" className="field-feedback">
          Changed elsewhere to “{value}”. Enter applies your draft; Escape uses the latest.
        </small>
      )}
    </div>
  );
}
