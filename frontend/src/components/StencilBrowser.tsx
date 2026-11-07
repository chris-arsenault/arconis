import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { EditorController } from "../editor/controller";
import { ICON_VENDORS, type IconVendor } from "../document/geometry";
import {
  iconEntries,
  iconEntry,
  iconImage,
  iconsVersion,
  loadAllVendors,
  loadIcons,
  loadVendor,
  searchIcons,
  subscribeIcons,
  vendorEntries,
  type IconEntry,
} from "../editor/icons";
import { PanelTop } from "lucide-react";
import { SCREEN_SIZES, type ScreenSize } from "../document/screens";
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
      pressed={editor.tool === stencil.kind && !editor.armedScreen}
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

function ScreenStencil({
  editor,
  screen,
}: Readonly<{ editor: EditorController; screen: ScreenSize }>) {
  return (
    <StencilButton
      label={`Screen: ${screen.name}, ${screen.width} by ${screen.height}`}
      pressed={editor.armedScreen?.name === screen.name}
      onArm={() => editor.armScreen(screen)}
      onDrop={(event) => {
        const point = pointInCanvas(editor, event);
        if (point) editor.add("panel", point.x, point.y, null, screen);
      }}
    >
      <PanelTop size={20} strokeWidth={1.5} />
      <span>{screen.name}</span>
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

/** Memoized because large icon sets would otherwise re-render on every editor update. */
const IconButtons = memo(function IconButtons({
  editor,
  entries,
}: Readonly<{ editor: EditorController; entries: IconEntry[]; armedKey: string }>) {
  return entries.map((entry) => <IconStencil key={entry.key} editor={editor} entry={entry} />);
});

const VENDOR_TITLES: Record<IconVendor, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "Google Cloud",
};

function VendorGroup({
  editor,
  vendor,
  version,
}: Readonly<{ editor: EditorController; vendor: IconVendor; version: number }>) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () => (open ? vendorEntries(vendor) : []),
    // A new icon set arriving changes the version, not the arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, vendor, version]
  );
  return (
    <details
      className="vendor-group"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        if (isOpen) void loadVendor(vendor);
      }}
    >
      <summary>{VENDOR_TITLES[vendor]}</summary>
      {open && (
        <div className="stencil-grid">
          <IconButtons editor={editor} entries={entries} armedKey={editor.armedIcon?.key ?? ""} />
        </div>
      )}
    </details>
  );
}

function SearchResults({
  editor,
  query,
  version,
}: Readonly<{ editor: EditorController; query: string; version: number }>) {
  const shapes = STENCIL_GROUPS.flatMap((group) => group.stencils).filter((stencil) =>
    stencil.name.toLowerCase().includes(query)
  );
  const icons = useMemo(
    () => searchIcons(query, MAX_RESULTS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, version]
  );
  if (!shapes.length && !icons.length) return <p className="stencil-empty">No stencils match.</p>;
  return (
    <Group title="Results">
      {shapes.map((stencil) => (
        <ShapeStencil key={stencil.kind} editor={editor} stencil={stencil} />
      ))}
      <IconButtons editor={editor} entries={icons} armedKey={editor.armedIcon?.key ?? ""} />
    </Group>
  );
}

export function StencilBrowser({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const version = useSyncExternalStore(subscribeIcons, iconsVersion);
  useEffect(() => void loadIcons(), []);
  const search = query.trim().toLowerCase();
  useEffect(() => {
    if (search) void loadAllVendors();
  }, [search]);
  const armedKey = editor.armedIcon?.key ?? "";
  const infrastructure = useMemo(
    () => INFRASTRUCTURE_ICONS.flatMap((key) => iconEntry(key) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
  const technology = useMemo(
    () => iconEntries().filter((entry) => entry.key.startsWith("brand:")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
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
          <SearchResults editor={editor} query={search} version={version} />
        ) : (
          <>
            {STENCIL_GROUPS.map((group) => (
              <Group key={group.title} title={group.title}>
                {group.stencils.map((stencil) => (
                  <ShapeStencil key={stencil.kind} editor={editor} stencil={stencil} />
                ))}
              </Group>
            ))}
            <Group title="Screens">
              {SCREEN_SIZES.map((screen) => (
                <ScreenStencil key={screen.name} editor={editor} screen={screen} />
              ))}
            </Group>
            <section aria-label="Cloud providers">
              <h3>Cloud providers</h3>
              {ICON_VENDORS.map((vendor) => (
                <VendorGroup key={vendor} editor={editor} vendor={vendor} version={version} />
              ))}
            </section>
            <Group title="Infrastructure">
              <IconButtons editor={editor} entries={infrastructure} armedKey={armedKey} />
            </Group>
            <Group title="Technology">
              <IconButtons editor={editor} entries={technology} armedKey={armedKey} />
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
