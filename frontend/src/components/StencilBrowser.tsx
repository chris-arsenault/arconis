import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { EditorController } from "../editor/controller";
import {
  iconEntries,
  iconEntry,
  iconImage,
  iconsVersion,
  loadIcons,
  subscribeIcons,
  type IconEntry,
} from "../editor/icons";
import { INFRASTRUCTURE_ICONS, STENCIL_GROUPS, type Stencil } from "./stencils";

const DRAG_THRESHOLD = 4;
const MAX_RESULTS = 60;

function pointInCanvas(editor: EditorController, event: PointerEvent) {
  const bounds = editor.element.getBoundingClientRect();
  const inside =
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom;
  return inside ? editor.graph.getPointForEvent(event) : null;
}

function createGhost(button: HTMLElement) {
  const ghost = button.cloneNode(true) as HTMLElement;
  ghost.classList.add("stencil-ghost");
  document.body.append(ghost);
  return ghost;
}

function StencilButton({
  label,
  pressed,
  onArm,
  onDrop,
  children,
}: Readonly<{
  label: string;
  pressed: boolean;
  onArm: () => void;
  onDrop: (event: PointerEvent) => void;
  children: ReactNode;
}>) {
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
      if (ghost) onDrop(upEvent);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };
  return (
    <button
      className="tool stencil"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={startDrag}
      onClick={() => {
        if (!dragged.current) onArm();
      }}
    >
      {children}
    </button>
  );
}

function ShapeStencil({
  editor,
  stencil,
}: Readonly<{ editor: EditorController; stencil: Stencil }>) {
  return (
    <StencilButton
      label={stencil.label}
      pressed={editor.tool === stencil.kind}
      onArm={() => editor.setTool(stencil.kind)}
      onDrop={(event) => {
        const point = pointInCanvas(editor, event);
        if (!point) return;
        const id = editor.add(stencil.kind, point.x, point.y);
        if (stencil.kind === "sticky" || stencil.kind === "text") editor.edit(id, true);
      }}
    >
      <stencil.icon size={20} strokeWidth={1.5} />
      <span>{stencil.name}</span>
    </StencilButton>
  );
}

function IconStencil({ editor, entry }: Readonly<{ editor: EditorController; entry: IconEntry }>) {
  const choice = { key: entry.key, title: entry.title };
  return (
    <StencilButton
      label={`Icon: ${entry.title}`}
      pressed={editor.armedIcon?.key === entry.key}
      onArm={() => editor.armIcon(choice)}
      onDrop={(event) => {
        const point = pointInCanvas(editor, event);
        if (point) editor.add("icon", point.x, point.y, choice);
      }}
    >
      <img
        src={iconImage(entry.key) ?? undefined}
        alt=""
        width={20}
        height={20}
        draggable={false}
      />
      <span>{entry.title}</span>
    </StencilButton>
  );
}

function Group({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <div className="stencil-grid">{children}</div>
    </section>
  );
}

function SearchResults({ editor, query }: Readonly<{ editor: EditorController; query: string }>) {
  const shapes = STENCIL_GROUPS.flatMap((group) => group.stencils).filter((stencil) =>
    stencil.name.toLowerCase().includes(query)
  );
  const icons = iconEntries()
    .filter((entry) => entry.search.includes(query))
    .slice(0, MAX_RESULTS);
  if (!shapes.length && !icons.length) return <p className="stencil-empty">No stencils match.</p>;
  return (
    <Group title="Results">
      {shapes.map((stencil) => (
        <ShapeStencil key={stencil.kind} editor={editor} stencil={stencil} />
      ))}
      {icons.map((entry) => (
        <IconStencil key={entry.key} editor={editor} entry={entry} />
      ))}
    </Group>
  );
}

export function StencilBrowser({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  useSyncExternalStore(subscribeIcons, iconsVersion);
  useEffect(() => void loadIcons(), []);
  const search = query.trim().toLowerCase();
  const infrastructure = INFRASTRUCTURE_ICONS.flatMap((key) => iconEntry(key) ?? []);
  const technology = iconEntries().filter((entry) => entry.key.startsWith("brand:"));
  return (
    <div className="stencil-browser">
      <input
        className="stencil-search"
        type="search"
        aria-label="Search stencils"
        placeholder="Search shapes and icons"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="stencil-groups">
        {search ? (
          <SearchResults editor={editor} query={search} />
        ) : (
          <>
            {STENCIL_GROUPS.map((group) => (
              <Group key={group.title} title={group.title}>
                {group.stencils.map((stencil) => (
                  <ShapeStencil key={stencil.kind} editor={editor} stencil={stencil} />
                ))}
              </Group>
            ))}
            <Group title="Infrastructure">
              {infrastructure.map((entry) => (
                <IconStencil key={entry.key} editor={editor} entry={entry} />
              ))}
            </Group>
            <Group title="Technology">
              {technology.map((entry) => (
                <IconStencil key={entry.key} editor={editor} entry={entry} />
              ))}
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
