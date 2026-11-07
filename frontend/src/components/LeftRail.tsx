import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import type { SavedView } from "../document/types";
import { STENCIL_GROUPS, TOOLS, type Stencil } from "./stencils";

const DRAG_THRESHOLD = 4;

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
      <div className="stencil-groups">
        {STENCIL_GROUPS.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            <div className="stencil-grid">
              {group.stencils.map((stencil) => (
                <StencilButton key={stencil.kind} editor={editor} stencil={stencil} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <SavedViews editor={editor} />
    </aside>
  );
}

function StencilButton({
  editor,
  stencil,
}: Readonly<{ editor: EditorController; stencil: Stencil }>) {
  const dragged = useRef(false);
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const { clientX: startX, clientY: startY } = event;
    const button = event.currentTarget;
    dragged.current = false;
    let ghost: HTMLElement | null = null;
    const move = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!ghost && distance < DRAG_THRESHOLD) return;
      dragged.current = true;
      ghost ??= createGhost(button);
      ghost.style.transform = `translate(${moveEvent.clientX}px, ${moveEvent.clientY}px)`;
    };
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      ghost?.remove();
      if (ghost) dropStencil(editor, stencil, upEvent);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };
  return (
    <button
      className="tool stencil"
      title={stencil.label}
      aria-label={stencil.label}
      aria-pressed={editor.tool === stencil.kind}
      onPointerDown={startDrag}
      onClick={() => {
        if (!dragged.current) editor.setTool(stencil.kind);
      }}
    >
      <stencil.icon size={20} strokeWidth={1.5} />
      <span>{stencil.name}</span>
    </button>
  );
}

function createGhost(button: HTMLElement) {
  const ghost = button.cloneNode(true) as HTMLElement;
  ghost.classList.add("stencil-ghost");
  document.body.append(ghost);
  return ghost;
}

function dropStencil(editor: EditorController, stencil: Stencil, event: PointerEvent) {
  const bounds = editor.element.getBoundingClientRect();
  const inside =
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom;
  if (!inside) return;
  const point = editor.graph.getPointForEvent(event);
  const id = editor.add(stencil.kind, point.x, point.y);
  if (stencil.kind === "sticky" || stencil.kind === "text") editor.edit(id, true);
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
