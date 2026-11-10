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
} from "../assets/icons/catalog";
import { PanelTop } from "lucide-react";
import { SCREEN_SIZES, type ScreenSize } from "../document/screens";
import { INFRASTRUCTURE_ICONS, STENCIL_GROUPS, type Stencil } from "./stencils";
import { RailSection } from "./RailSection";
import { useRailSections } from "./useRailSections";

const DRAG_THRESHOLD = 4;
const MAX_RESULTS = 60;
const LIBRARIES = {
  Basics: true,
  Architecture: true,
  Screens: false,
  Infrastructure: false,
  Technology: false,
  aws: false,
  azure: false,
  gcp: false,
};

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
      data-hint={label}
      data-hint-detail="Drag this onto the canvas, or choose it and then click where it goes."
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
      pressed={editor.tool === stencil.shape && !editor.armedScreen}
      onArm={() => editor.setTool(stencil.shape)}
      onDrop={(event) => {
        const point = pointInCanvas(editor, event);
        if (!point) return;
        const id = editor.add(stencil.shape, { x: point.x, y: point.y, anchor: "corner" });
        if (stencil.shape === "note" || stencil.shape === "text") editor.edit(id, true);
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
        if (point) editor.add("frame", { x: point.x, y: point.y, anchor: "corner" }, null, screen);
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
        if (point) editor.add("icon", { x: point.x, y: point.y, anchor: "corner" }, choice);
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

/** Help for each library's header, which opens and closes that library. */
const LIBRARY_DETAILS: Record<string, string> = {
  Basics: "Sticky notes, text, simple shapes and frames.",
  Architecture: "Service, database, cloud and person shapes for system diagrams.",
  Screens: "Frames sized like phone, tablet, laptop and desktop screens.",
  Infrastructure: "Generic icons for servers, storage, networks, security, devices and more.",
  Technology: "Logos of common technologies, such as Docker, to label parts of a diagram.",
  aws: "Amazon Web Services architecture icons, loaded when you open this library.",
  azure: "Microsoft Azure architecture icons, loaded when you open this library.",
  gcp: "Google Cloud architecture icons, loaded when you open this library.",
};

function VendorGroup({
  editor,
  vendor,
  version,
  open,
  onToggle,
}: Readonly<{
  editor: EditorController;
  vendor: IconVendor;
  version: number;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
}>) {
  useEffect(() => {
    if (open) void loadVendor(vendor);
  }, [open, vendor]);
  const entries = useMemo(
    () => (open ? vendorEntries(vendor) : []),
    // A new icon set arriving changes the version, not the arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, vendor, version]
  );
  return (
    <RailSection
      id={vendor}
      title={VENDOR_TITLES[vendor]}
      detail={LIBRARY_DETAILS[vendor]}
      open={open}
      onToggle={onToggle}
    >
      {open && (
        <div className="stencil-grid">
          {!entries.length && (
            <p className="stencil-empty" role="status">
              Loading icons…
            </p>
          )}
          <IconButtons editor={editor} entries={entries} armedKey={editor.armedIcon?.key ?? ""} />
        </div>
      )}
    </RailSection>
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
  const screens = SCREEN_SIZES.filter((screen) => screen.name.toLowerCase().includes(query));
  if (!shapes.length && !icons.length && !screens.length)
    return <p className="stencil-empty">No stencils match.</p>;
  return (
    <section aria-label="Search results" className="stencil-grid search-results">
      {shapes.map((stencil) => (
        <ShapeStencil key={stencil.shape} editor={editor} stencil={stencil} />
      ))}
      <IconButtons editor={editor} entries={icons} armedKey={editor.armedIcon?.key ?? ""} />
      {screens.map((screen) => (
        <ScreenStencil key={screen.name} editor={editor} screen={screen} />
      ))}
    </section>
  );
}

export function StencilBrowser({ editor }: Readonly<{ editor: EditorController }>) {
  const [query, setQuery] = useState("");
  const sections = useRailSections(LIBRARIES, "arconis.libraries");
  const version = useSyncExternalStore(subscribeIcons, iconsVersion);
  useEffect(() => void loadIcons(), []);
  const search = query.trim().toLowerCase();
  useEffect(() => {
    if (search) void loadAllVendors();
  }, [search]);
  return (
    <div className="stencil-browser">
      <div className="rail-heading">
        <h2>Add to canvas</h2>
        <p>Drag an item onto the canvas, or choose it and click to place.</p>
      </div>
      <input
        className="stencil-search"
        type="search"
        aria-label="Search stencils"
        placeholder="Search shapes and icons"
        data-hint-detail="Find shapes, screens and icons from every library by name."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="stencil-groups">
        {search ? (
          <SearchResults editor={editor} query={search} version={version} />
        ) : (
          <>
            <Libraries editor={editor} sections={sections} version={version} />
          </>
        )}
      </div>
    </div>
  );
}

interface LibraryProps {
  editor: EditorController;
  sections: ReturnType<typeof useRailSections>;
  version: number;
}
function Libraries({ editor, sections, version }: Readonly<LibraryProps>) {
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
    <>
      {STENCIL_GROUPS.map((group) => (
        <RailSection
          key={group.title}
          id={group.title}
          title={group.title}
          detail={LIBRARY_DETAILS[group.title]}
          open={sections.open[group.title]}
          onToggle={sections.toggle}
        >
          <div className="stencil-grid">
            {group.stencils.map((stencil) => (
              <ShapeStencil key={stencil.shape} editor={editor} stencil={stencil} />
            ))}
          </div>
        </RailSection>
      ))}
      <RailSection
        id="Screens"
        title="Screens"
        detail={LIBRARY_DETAILS.Screens}
        open={sections.open.Screens}
        onToggle={sections.toggle}
      >
        <div className="stencil-grid">
          {SCREEN_SIZES.map((screen) => (
            <ScreenStencil key={screen.name} editor={editor} screen={screen} />
          ))}
        </div>
      </RailSection>
      {[
        { title: "Infrastructure", entries: infrastructure },
        { title: "Technology", entries: technology },
      ].map(({ title, entries }) => (
        <RailSection
          key={title}
          id={title}
          title={title}
          detail={LIBRARY_DETAILS[title]}
          open={sections.open[title]}
          onToggle={sections.toggle}
        >
          <div className="stencil-grid">
            <IconButtons editor={editor} entries={entries} armedKey={armedKey} />
          </div>
        </RailSection>
      ))}
      {ICON_VENDORS.map((vendor) => (
        <VendorGroup
          key={vendor}
          editor={editor}
          vendor={vendor}
          version={version}
          open={sections.open[vendor]}
          onToggle={sections.toggle}
        />
      ))}
    </>
  );
}
