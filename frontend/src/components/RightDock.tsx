import { useState, useSyncExternalStore } from "react";
import { Compass, Layers, Presentation, SlidersHorizontal, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { SlidesPanel } from "./SlidesPanel";
import { NavigatePanel } from "./NavigatePanel";
import { PANEL_DETAILS, PANEL_TOPICS, type DockPanel } from "./railHelp";
import { useNarrowLayout } from "./useNarrowLayout";
import "./dock.css";

const DOCK_KEY = "arconis.dock";
const TABS = [
  { id: "layers", label: "Layers", icon: Layers },
  { id: "slides", label: "Slides", icon: Presentation },
  { id: "navigate", label: "Navigate", icon: Compass },
] as const;
interface DockState {
  tab: DockPanel;
  open: boolean;
}

function stored(): DockState {
  try {
    const saved = JSON.parse(localStorage.getItem(DOCK_KEY) ?? "null") as Partial<DockState> | null;
    const tab = TABS.find(({ id }) => id === saved?.tab)?.id ?? "layers";
    return { tab, open: saved?.open === true };
  } catch {
    return { tab: "layers", open: false };
  }
}

/** The document panel that is showing, kept on this device; arming Add slide shows Slides. */
function useDockPanel(editor: EditorController) {
  const selection = editor
    .selected()
    .map((item) => item.id)
    .join(" ");
  const [state, setState] = useState(() => {
    const saved = stored();
    const slides = editor.tool === "slide";
    return {
      tab: slides ? ("slides" as const) : saved.tab,
      open: slides || (!selection && saved.open),
      tool: editor.tool,
      selection,
    };
  });
  const save = (next: DockState) => {
    setState({ ...next, tool: editor.tool, selection });
    try {
      localStorage.setItem(DOCK_KEY, JSON.stringify(next));
    } catch {
      /* The choice still holds for this page when local preferences are unavailable. */
    }
  };
  if (state.tool !== editor.tool || state.selection !== selection) {
    const slides = editor.tool === "slide";
    const selectedOnCanvas =
      selection &&
      state.selection !== selection &&
      !document.activeElement?.closest(".dock-content");
    setState({
      tab: slides ? "slides" : state.tab,
      open: slides || (selectedOnCanvas ? false : state.open),
      tool: editor.tool,
      selection,
    });
  }
  const choose = (tab: DockPanel) => save({ tab, open: !(state.open && state.tab === tab) });
  return {
    tab: state.tab,
    open: state.open,
    choose,
    properties: () => save({ tab: state.tab, open: false }),
  };
}

/** On a narrow screen the dock opens over the canvas from this button. */
export function DockToggle({
  selection,
  open,
  onToggle,
}: Readonly<{ selection: boolean; open: boolean; onToggle: () => void }>) {
  const closed = selection ? "Object properties" : "Document panels";
  return (
    <button
      className="properties-toggle"
      aria-label={open ? "Close properties" : closed}
      aria-expanded={open}
      data-help-id="dock-toggle"
      data-hint-detail="Show or hide the selection's properties and the layers, slides and navigation panels."
      onClick={onToggle}
    >
      {open ? <X size={16} /> : <SlidersHorizontal size={16} />}
      {selection ? "Properties" : "Panels"}
    </button>
  );
}

/**
 * Each task gets the full dock height. Selecting on the canvas returns to Properties; selecting
 * from a document panel keeps that panel available for layer and navigation actions.
 */
export function RightDock({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const narrow = useNarrowLayout();
  const { tab, open, choose, properties } = useDockPanel(editor);
  const selection = editor.selected().length > 0;
  // With nothing selected and no panel open the dock is only its tabs, leaving the canvas wide.
  // A narrow screen opens the dock over the canvas on request, so there it always shows in full.
  const collapsed = !narrow && !selection && !open;
  return (
    <div
      className="right-dock"
      data-help-id="dock"
      data-selection={selection}
      data-collapsed={collapsed}
    >
      <nav className="dock-tabs" aria-label="Document panels">
        <button
          aria-label="Properties"
          aria-pressed={!open && selection}
          data-hint-detail="Show the selected object's properties using the full panel height."
          onClick={properties}
        >
          <SlidersHorizontal size={16} />
          <span>Properties</span>
        </button>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-label={label}
            aria-pressed={open && tab === id}
            aria-controls="dock-content"
            data-help-id={`dock-${id}`}
            data-help-topic={PANEL_TOPICS[id]}
            data-hint={label}
            data-hint-detail={PANEL_DETAILS[id]}
            onClick={() => choose(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <DockContent
        editor={editor}
        open={open}
        selection={selection}
        collapsed={collapsed}
        tab={tab}
      />
    </div>
  );
}

function DockContent({
  editor,
  open,
  selection,
  collapsed,
  tab,
}: Readonly<{
  editor: EditorController;
  open: boolean;
  selection: boolean;
  collapsed: boolean;
  tab: DockPanel;
}>) {
  if (!open) {
    if (selection) {
      const selected = editor.selected();
      const [item] = selected;
      const key =
        selected.length === 1 ? `${item.type}:${item.stencil}:${Boolean(item.clock)}` : "multiple";
      return <Inspector key={key} editor={editor} />;
    }
    if (collapsed) return null;
    return <p className="dock-empty">Select an object to see its properties.</p>;
  }
  return (
    <section className="dock-panels" data-open={open} aria-label="Document">
      {open && (
        <div
          className="rail-content dock-content"
          id="dock-content"
          data-help-id="dock-content"
          data-help-topic={PANEL_TOPICS[tab]}
        >
          {tab === "layers" && <LayersPanel editor={editor} />}
          {tab === "slides" && <SlidesPanel editor={editor} />}
          {tab === "navigate" && <NavigatePanel editor={editor} />}
        </div>
      )}
    </section>
  );
}
