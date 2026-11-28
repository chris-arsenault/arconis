import { memo, useEffect, useMemo, useSyncExternalStore } from "react";
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
import { INFRASTRUCTURE_ICONS, SHAPE_LIBRARIES, type Stencil } from "./stencils";
import { RailSection } from "./RailSection";
import type { useRailSections } from "./useRailSections";
import { pointInCanvas } from "../editor/creationScale";
import { StencilButton } from "./StencilButton";

const MAX_RESULTS = 60;

function ShapeStencil({
  editor,
  stencil,
}: Readonly<{ editor: EditorController; stencil: Stencil }>) {
  return (
    <StencilButton
      label={stencil.label}
      pressed={editor.tool === stencil.shape && !editor.armedScreen && !editor.armedWood}
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
      count={0}
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

export interface LibraryProps {
  editor: EditorController;
  sections: ReturnType<typeof useRailSections>;
  search: string;
}

export function ShapeLibrary({
  editor,
  sections,
  search,
  title,
}: LibraryProps & { title: keyof typeof SHAPE_LIBRARIES }) {
  const buttons = SHAPE_LIBRARIES[title]
    .filter((stencil) => stencil.name.toLowerCase().includes(search))
    .map((stencil) => <ShapeStencil key={stencil.shape} editor={editor} stencil={stencil} />);
  if (search) return <div className="stencil-grid">{buttons}</div>;
  return (
    <RailSection
      id={title}
      title={title}
      count={0}
      detail={LIBRARY_DETAILS[title]}
      open={sections.open[title]}
      onToggle={sections.toggle}
    >
      <div className="stencil-grid">{buttons}</div>
    </RailSection>
  );
}

export function ScreenLibrary({ editor, sections, search }: Readonly<LibraryProps>) {
  const buttons = SCREEN_SIZES.filter((screen) => screen.name.toLowerCase().includes(search)).map(
    (screen) => <ScreenStencil key={screen.name} editor={editor} screen={screen} />
  );
  if (search) return <div className="stencil-grid">{buttons}</div>;
  return (
    <RailSection
      id="Screens"
      title="Screens"
      count={0}
      detail={LIBRARY_DETAILS.Screens}
      open={sections.open.Screens}
      onToggle={sections.toggle}
    >
      <div className="stencil-grid">{buttons}</div>
    </RailSection>
  );
}

export function ArchitectureLibrary(props: Readonly<LibraryProps>) {
  const { editor, sections, search } = props;
  const version = useSyncExternalStore(subscribeIcons, iconsVersion);
  useEffect(() => void loadIcons(), []);
  useEffect(() => {
    if (search) void loadAllVendors();
  }, [search]);
  const armedKey = editor.armedIcon?.key ?? "";
  const icons = useMemo(
    () => (search ? searchIcons(search, MAX_RESULTS) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, version]
  );
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
      <ShapeLibrary {...props} title="Architecture" />
      {search ? (
        <div className="stencil-grid">
          <IconButtons editor={editor} entries={icons} armedKey={armedKey} />
        </div>
      ) : (
        <>
          {[
            { title: "Infrastructure", entries: infrastructure },
            { title: "Technology", entries: technology },
          ].map(({ title, entries }) => (
            <RailSection
              key={title}
              id={title}
              count={0}
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
      )}
    </>
  );
}
