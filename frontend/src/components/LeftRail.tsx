import { useEffect, useState, useSyncExternalStore } from "react";
import { Pencil, Shapes } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { StencilBrowser } from "./StencilBrowser";
import { TOOLS } from "./stencils";
import { DrawingTools, type DrawingActions } from "./DrawingTools";
import { isMarkup } from "../document/ink";
import { PanelHeading } from "./RailSection";
import { HelpZone } from "./HelpZone";
import { PANEL_DETAILS, PANEL_TOPICS, TOOL_DETAILS, type RailPanel } from "./railHelp";

const TOOL_NAMES: Record<string, string> = {
  select: "Select",
  pan: "Pan",
  connect: "Connect",
  markup: "Markup",
  measure: "Measure",
};
/** Tools that place nothing, so choosing one leaves the panel as it was. */
const NOT_PLACING = ["select", "pan", "connect", "markup", "measure", "draw", "slide"];
const PANELS = [
  { id: "add", label: "Shapes", icon: Shapes, hint: "Shapes" },
  { id: "draw", label: "Draw", icon: Pencil, hint: "Draw (P)" },
] as const;
type RailLayout =
  { mode: "wide" } | { mode: "compact"; expanded: boolean; onExpand: (open: boolean) => void };

/** Tool shortcuts open their controls; Markup and selection leave the panel as it was. */
function usePanel(editor: EditorController, layout: RailLayout) {
  const compact = layout.mode === "compact";
  const onExpand = layout.mode === "compact" ? layout.onExpand : null;
  const [state, setState] = useState<{ panel: RailPanel; tool: string; expanded: boolean }>(() => ({
    panel: "add",
    tool: "select",
    expanded: !compact,
  }));
  useEffect(() => {
    if (compact && !["select", "pan", "connect", "draw"].includes(editor.tool)) onExpand?.(false);
  }, [compact, editor.tool, onExpand]);
  if (state.tool !== editor.tool) {
    let panel = state.panel;
    const placing = !NOT_PLACING.includes(editor.tool);
    if (editor.tool === "draw") panel = "draw";
    else if (placing) panel = "add";
    const opens = placing || editor.tool === "draw";
    setState({ panel, tool: editor.tool, expanded: state.expanded || opens });
  }
  const choose = (panel: RailPanel) => {
    editor.setTool(panel === "draw" ? "draw" : "select");
    setState({ panel, tool: editor.tool, expanded: true });
    onExpand?.(true);
  };
  const expanded = layout.mode === "compact" ? layout.expanded : state.expanded;
  const toggle = () => {
    setState({ ...state, expanded: !expanded });
    onExpand?.(!expanded);
  };
  return { panel: state.panel, expanded, choose, toggle };
}

/** Select, Pan, Connect, Markup and Measure stay above every panel: each works whatever it shows. */
function ToolRow({ editor }: Readonly<{ editor: EditorController }>) {
  const annotations = editor.document.list().filter(isMarkup).length;
  return (
    <div
      className="tool-row"
      role="toolbar"
      aria-label="Canvas tools"
      data-help-id="rail-tools"
      data-help-topic="editing#select-and-transform"
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          data-hint={tool.label}
          data-hint-detail={TOOL_DETAILS[tool.id]}
          data-help-id={tool.id === "markup" ? "markup-tool" : undefined}
          data-help-topic={tool.id === "markup" ? "drawing#markup" : undefined}
          aria-label={tool.label}
          aria-pressed={editor.tool === tool.id}
          className="tool"
          onClick={() => editor.setTool(tool.id)}
        >
          <tool.icon size={17} />
          <span>{TOOL_NAMES[tool.id]}</span>
          {tool.id === "markup" && annotations > 0 && (
            <span className="tool-badge" data-testid="markup-count">
              {annotations}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function LeftRail(props: Readonly<{ editor: EditorController } & RailLayout>) {
  const { editor } = props;
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const { panel, expanded, choose, toggle } = usePanel(editor, props);
  return (
    <aside className="left-rail" aria-label="Tools and stencils" data-expanded={expanded}>
      <ToolRow editor={editor} />
      <nav className="rail-tabs" aria-label="Workspace panels">
        {PANELS.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            aria-label={label}
            aria-pressed={panel === id}
            aria-controls="rail-content"
            data-help-id={`rail-${id}`}
            data-help-topic={PANEL_TOPICS[id]}
            data-hint={hint}
            data-hint-detail={PANEL_DETAILS[id]}
            onClick={() => choose(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button
        className="rail-collapse"
        aria-expanded={expanded}
        data-hint-detail="Fold this panel away for more canvas, or bring it back."
        onClick={toggle}
      >
        {expanded ? "Hide panel" : "Show panel"}
      </button>
      <div
        className="rail-content"
        id="rail-content"
        data-help-id="rail-content"
        data-help-topic={PANEL_TOPICS[panel]}
      >
        {panel === "add" && <StencilBrowser editor={editor} />}
        {panel === "draw" && <DrawingSection editor={editor} />}
      </div>
      <HelpZone />
    </aside>
  );
}

function DrawingSection({ editor }: Readonly<{ editor: EditorController }>) {
  const layer = editor.document.layerList().find(({ id }) => id === editor.layers.active);
  return (
    <section aria-label="Drawing" className="drawing-section">
      <PanelHeading title="Draw">Draw editable ink that stays part of the canvas.</PanelHeading>
      <DrawingTools
        tool={editor.drawing.brushTool}
        colorTarget={editor.drawing.colorTarget}
        armed={editor.tool === "draw"}
        layer={layer?.name ?? ""}
        settings={editor.drawing.brush}
        favorites={editor.drawing.favorites}
        recent={editor.drawing.recent}
        actions={drawingActions(editor)}
      />
    </section>
  );
}

function drawingActions(editor: EditorController): DrawingActions {
  const drawing = editor.drawing;
  return {
    tool: (tool) => drawing.activate(tool),
    target: (target) => {
      drawing.colorTarget = target;
      editor.emit();
    },
    change: (settings) => drawing.update(settings),
    favorite: (index, save) => drawing.favorite(index, save),
  };
}
