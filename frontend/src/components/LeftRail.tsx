import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { SavedView } from "../document/types";
import { StencilBrowser } from "./StencilBrowser";
import { TOOLS } from "./stencils";

export function LeftRail({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <aside className="left-rail" aria-label="Tools and stencils">
      <div className="tool-row" role="toolbar" aria-label="Canvas tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={editor.tool === tool.id}
            className="tool"
            onClick={() => editor.setTool(tool.id)}
          >
            <tool.icon size={17} />
          </button>
        ))}
      </div>
      <StencilBrowser editor={editor} />
      <SavedViews editor={editor} />
    </aside>
  );
}

function SavedViews({ editor }: Readonly<{ editor: EditorController }>) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState("");
  const views = editor.savedViews();
  return (
    <section className="saved-views" aria-label="Saved views">
      <h3>Saved views</h3>
      <div className="saved-view-list">
        {views.map((view) =>
          renaming === view.id ? (
            <RenameView key={view.id} view={view} editor={editor} onDone={() => setRenaming("")} />
          ) : (
            <div className="saved-view" key={view.id}>
              <button className="saved-view-name" onClick={() => editor.goToView(view)}>
                {view.name}
              </button>
              <button
                className="saved-view-action"
                title={`Rename ${view.name}`}
                aria-label={`Rename view ${view.name}`}
                onClick={() => setRenaming(view.id)}
              >
                <Pencil size={12} />
              </button>
              <button
                className="saved-view-action"
                title={`Remove ${view.name}`}
                aria-label={`Remove view ${view.name}`}
                onClick={() => editor.removeView(view.id)}
              >
                <X size={13} />
              </button>
            </div>
          )
        )}
      </div>
      <form
        className="save-view"
        onSubmit={(event) => {
          event.preventDefault();
          editor.saveView(name.trim() || `View ${views.length + 1}`);
          setName("");
        }}
      >
        <input
          aria-label="View name"
          placeholder="Save this place"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button aria-label="Save current view" title="Save current view">
          <Plus size={15} />
        </button>
      </form>
    </section>
  );
}

function RenameView({
  view,
  editor,
  onDone,
}: Readonly<{ view: SavedView; editor: EditorController; onDone: () => void }>) {
  const [name, setName] = useState(view.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const commit = () => {
    if (name.trim()) editor.renameView(view, name.trim());
    onDone();
  };
  return (
    <form
      className="saved-view"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <input
        ref={input}
        aria-label={`New name for ${view.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
      />
    </form>
  );
}
