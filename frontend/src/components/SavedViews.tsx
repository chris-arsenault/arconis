import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { View } from "../document/types";

export function SavedViews({
  views,
  onGo,
  onRemove,
  onRename,
  onSave,
}: Readonly<{
  views: View[];
  onGo: (view: View) => void;
  onRemove: (id: string) => void;
  onRename: (view: View, name: string) => void;
  onSave: (name: string) => void;
}>) {
  const [renaming, setRenaming] = useState("");
  return (
    <>
      {views.length > 0 && (
        <div className="rail-list">
          {views.map((view) =>
            renaming === view.id ? (
              <RenameView
                key={view.id}
                view={view}
                onRename={(name) => onRename(view, name)}
                onDone={() => setRenaming("")}
              />
            ) : (
              <div className="rail-row" key={view.id}>
                <button
                  className="rail-entry"
                  data-hint={view.name}
                  data-hint-detail="Return to this shared position and zoom."
                  onClick={() => onGo(view)}
                >
                  {view.name}
                </button>
                <button
                  className="rail-action"
                  data-hint={`Rename ${view.name}`}
                  aria-label={`Rename view ${view.name}`}
                  onClick={() => setRenaming(view.id)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="rail-action"
                  data-hint={`Remove ${view.name}`}
                  aria-label={`Remove view ${view.name}`}
                  onClick={() => onRemove(view.id)}
                >
                  <X size={13} />
                </button>
              </div>
            )
          )}
        </div>
      )}
      <SaveViewForm count={views.length} onSave={onSave} />
    </>
  );
}

function SaveViewForm({
  count,
  onSave,
}: Readonly<{ count: number; onSave: (name: string) => void }>) {
  const [name, setName] = useState("");
  return (
    <form
      className="save-view"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name.trim() || `View ${count + 1}`);
        setName("");
      }}
    >
      <input
        aria-label="View name"
        placeholder="Name this place"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        aria-label="Save current view"
        data-hint="Save current view"
        data-hint-detail="Saves this position and zoom for everyone in the room."
      >
        <Plus size={15} /> Save view
      </button>
    </form>
  );
}

function RenameView({
  view,
  onRename,
  onDone,
}: Readonly<{ view: View; onRename: (name: string) => void; onDone: () => void }>) {
  const [name, setName] = useState(view.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const commit = () => {
    if (name.trim()) onRename(name.trim());
    onDone();
  };
  return (
    <form
      className="rail-row"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={input}
        className="rail-rename"
        aria-label={`New name for ${view.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
      />
    </form>
  );
}
