import { useState } from "react";
import { BookmarkPlus, Bookmark, X, Shapes } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { KIND_LABELS, LOCAL, type Bookmark as CanvasBookmark } from "../document/types";

export function Outline({
  editor,
  mode,
  onMode,
}: Readonly<{ editor: EditorController; mode: string; onMode: (mode: string) => void }>) {
  return (
    <aside className="outline">
      <div className="mode-switch" aria-label="Editing mode">
        <button aria-pressed={mode === "diagram"} onClick={() => onMode("diagram")}>
          Diagram
        </button>
        <button aria-pressed={mode === "ideas"} onClick={() => onMode("ideas")}>
          Ideas
        </button>
      </div>
      <ObjectList editor={editor} />
      <Bookmarks editor={editor} />
      <p className="outline-footnote">One canvas. Many perspectives.</p>
    </aside>
  );
}

function ObjectList({ editor }: Readonly<{ editor: EditorController }>) {
  const objects = editor.document.list();
  const selected = new Set(editor.selected().map((item) => item.id));
  return (
    <>
      <div className="outline-heading">
        <span className="eyebrow">ON THIS CANVAS</span>
        <span className="count">{objects.length}</span>
      </div>
      <div className="object-list" aria-label="Canvas objects">
        {objects.length === 0 && (
          <div className="empty-outline">
            <Shapes size={28} />
            <p>
              Every great system
              <br />
              starts with an idea.
            </p>
          </div>
        )}
        {objects.map((item) => (
          <button
            key={item.id}
            className={selected.has(item.id) ? "object-row selected" : "object-row"}
            title={KIND_LABELS[item.kind]}
            onClick={(event) => editor.select(item.id, event.shiftKey)}
            onDoubleClick={() => editor.edit(item.id)}
          >
            <span className={`object-symbol ${item.kind}`} />{" "}
            <span>{item.label || KIND_LABELS[item.kind]}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Bookmarks({ editor }: Readonly<{ editor: EditorController }>) {
  const [name, setName] = useState("");
  const bookmarks = [...editor.document.bookmarks.values()].map(
    (value) => JSON.parse(value) as CanvasBookmark
  );
  const add = () => {
    if (name.trim()) {
      editor.bookmark(name.trim());
      setName("");
    }
  };
  return (
    <section className="bookmarks">
      <div className="outline-heading">
        <span className="eyebrow">SAVED VIEWS</span>
        <Bookmark size={14} />
      </div>
      {bookmarks.map((bookmark) => (
        <div className="bookmark-row" key={bookmark.id}>
          <button onClick={() => editor.jump(bookmark)}>{bookmark.name}</button>
          <button
            title={`Remove ${bookmark.name}`}
            aria-label={`Remove view ${bookmark.name}`}
            onClick={() =>
              editor.document.doc.transact(
                () => editor.document.bookmarks.delete(bookmark.id),
                LOCAL
              )
            }
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          aria-label="View name"
          placeholder="Name this view"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button aria-label="Save current view" title="Save current view">
          <BookmarkPlus size={17} />
        </button>
      </form>
    </section>
  );
}
