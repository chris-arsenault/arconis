import { useState } from "react";
import type { Item, SourceReference } from "../document/types";
import { canonicalSources, sourceReferenceProblem } from "../document/sourceReferences";

const EMPTY_SOURCE: SourceReference = { path: "", anchor: "" };

/** Reference metadata only; the browser has no source checkout to open or inspect. */
export function SourceReferencesControls({
  item,
  onChange,
}: Readonly<{ item: Item; onChange: (sources: SourceReference[]) => void }>) {
  return (
    <div className="source-references">
      <p className="field-feedback">
        Repository paths for agents. These files are not opened here.
      </p>
      {item.sources.map((reference, index) => (
        <ReferenceForm
          key={JSON.stringify([item.id, reference.path, reference.anchor])}
          reference={reference}
          number={index + 1}
          onSave={(next) =>
            onChange(
              canonicalSources(item.sources.map((source) => (source === reference ? next : source)))
            )
          }
          onRemove={() => onChange(item.sources.filter((source) => source !== reference))}
        />
      ))}
      <ReferenceForm
        reference={EMPTY_SOURCE}
        number={0}
        onSave={(next) => onChange(canonicalSources([...item.sources, next]))}
        onRemove={null}
      />
    </div>
  );
}

function ReferenceForm({
  reference,
  number,
  onSave,
  onRemove,
}: Readonly<{
  reference: SourceReference;
  number: number;
  onSave: (reference: SourceReference) => void;
  onRemove: (() => void) | null;
}>) {
  const [draft, setDraft] = useState(reference);
  const problem = sourceReferenceProblem(draft);
  const isNew = number === 0;
  const changed = draft.path !== reference.path || draft.anchor !== reference.anchor;
  return (
    <form
      className="source-reference-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem || !changed) return;
        onSave(draft);
        if (isNew) setDraft({ path: "", anchor: "" });
      }}
    >
      <label>
        Path
        <input
          aria-label={isNew ? "New source path" : `Source path ${number}`}
          placeholder="src/storage.ts or src/storage/"
          value={draft.path}
          onChange={(event) => setDraft({ ...draft, path: event.target.value })}
        />
      </label>
      <label>
        Anchor (optional)
        <input
          aria-label={isNew ? "New source anchor" : `Source anchor ${number}`}
          placeholder="Type, function or schema name"
          value={draft.anchor}
          onChange={(event) => setDraft({ ...draft, anchor: event.target.value })}
        />
      </label>
      {draft.path && problem && (
        <small className="field-feedback" role="status">
          {problem}
        </small>
      )}
      <div className="source-reference-actions">
        <button
          type="submit"
          disabled={!!problem || !changed}
          aria-label={isNew ? "Add source reference" : `Save source reference ${number}`}
        >
          {isNew ? "Add reference" : "Save"}
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove source reference ${number}`}>
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
