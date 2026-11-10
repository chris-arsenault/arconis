import type { InkSettings } from "../editor/inkCommands";
import { BrushControls } from "./BrushControls";
import {
  DRAWING_FAMILIES,
  DRAWING_SHAPES,
  DRAWING_TOOLS,
  DRAWING_UTILITIES,
  drawingToolOf,
  type DrawingFamily,
  type DrawingTool,
} from "../editor/drawingTools";
import type { InkKind } from "../document/types";
import { StrokePreview } from "./StrokePreview";
import {
  DrawingDestination,
  type Destination,
  type DestinationActions,
} from "./DrawingDestination";
import "./drawing.css";
import {
  Circle,
  RectangleHorizontal,
  ArrowRight,
  ArrowLeftRight,
  Minus,
  Pentagon,
  Brackets,
  Braces,
  Cloud,
  Eraser,
  Highlighter,
  Lasso,
  PaintBucket,
  Pencil,
  PenTool,
  Pipette,
  Save,
  ScanLine,
  Scissors,
  type LucideIcon,
} from "lucide-react";

export interface DrawingActions extends DestinationActions {
  tool: (tool: DrawingTool) => void;
  family: (family: DrawingFamily) => void;
  style: (settings: Partial<InkSettings>) => void;
  target: (target: "color" | "fill") => void;
  change: (settings: Partial<InkSettings>) => void;
  favorite: (index: number, save: boolean) => void;
  promote: () => void;
  demote: () => void;
  close: () => void;
}
interface Props {
  tool: DrawingTool;
  armed: boolean;
  destination: Destination;
  colorTarget: "color" | "fill";
  settings: InkSettings;
  favorites: InkSettings[];
  recent: string[];
  selection: {
    canPromote: boolean;
    canDemote: boolean;
    strokes: number;
    settings: InkSettings | null;
    closed: boolean;
  };
  actions: DrawingActions;
}
const TOOL_ICONS: Record<DrawingTool, LucideIcon> = {
  freehand: Pencil,
  marker: Highlighter,
  highlightShape: RectangleHorizontal,
  outline: ScanLine,
  vector: PenTool,
  lasso: Lasso,
  eraser: Eraser,
  precision: Scissors,
  fill: PaintBucket,
  eyedropper: Pipette,
};
const FAMILY_ICONS: Record<DrawingFamily, LucideIcon> = {
  freehand: Pencil,
  highlight: Highlighter,
  vector: PenTool,
};
const FAMILY_HINTS: Record<DrawingFamily, string> = {
  freehand: "Draw a freehand pen stroke.",
  highlight: "Highlight with a marker, a translucent shape or an object outline.",
  vector: "Construct lines, arrows and shapes.",
};
const SHAPE_ICONS: Record<Exclude<InkKind, "freehand">, LucideIcon> = {
  line: Minus,
  arrow: ArrowRight,
  "double-arrow": ArrowLeftRight,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  polygon: Pentagon,
  bracket: Brackets,
  brace: Braces,
  cloud: Cloud,
};

/**
 * The panel follows the order of a person's decisions: where ink goes, which tool, that tool's
 * options, then the paint of the next mark or of the selected ink.
 */
export function DrawingTools(props: Readonly<Props>) {
  return (
    <div className="drawing-tools">
      <DrawingDestination destination={props.destination} actions={props.actions} />
      <ToolPalette props={props} />
      <ToolPaint props={props} />
      {!paintTarget(props).editing && <SelectedInkMoves props={props} />}
    </div>
  );
}

/** While a brush is armed, ink that stays selected can still change destination. */
function SelectedInkMoves({ props }: Readonly<{ props: Props }>) {
  const { selection } = props;
  if (!selection.canPromote && !selection.canDemote) return null;
  return (
    <section className="drawing-block" aria-label="Selected ink">
      <h3>
        Selected ink <span className="rail-count">{selection.strokes}</span>
      </h3>
      <DrawingObjectActions selection={selection} actions={props.actions} />
    </section>
  );
}

/** Creation and editing tools are one exclusive choice, so they render as one palette. */
function ToolPalette({ props }: Readonly<{ props: Props }>) {
  const { actions, tool, armed } = props;
  const spec = DRAWING_TOOLS[tool];
  return (
    <section className="drawing-block" aria-label="Tool">
      <h3>Tool</h3>
      <div className="drawing-palette" role="group" aria-label="Drawing tools">
        {DRAWING_FAMILIES.map(({ id, label }) => (
          <PaletteButton
            key={id}
            label={label}
            hint={FAMILY_HINTS[id]}
            Icon={FAMILY_ICONS[id]}
            active={armed && spec.family === id}
            choose={() => actions.family(id)}
          />
        ))}
        {DRAWING_UTILITIES.map((id) => (
          <PaletteButton
            key={id}
            label={DRAWING_TOOLS[id].label}
            hint={DRAWING_TOOLS[id].hint}
            Icon={TOOL_ICONS[id]}
            active={armed && tool === id}
            choose={() => actions.tool(id)}
          />
        ))}
      </div>
      {armed && <ToolOptions props={props} />}
      <p className="drawing-hint">
        {armed ? spec.hint : "Choose a tool, or edit the selected ink below."}
      </p>
    </section>
  );
}

function PaletteButton({
  label,
  hint,
  Icon,
  active,
  choose,
}: Readonly<{
  label: string;
  hint: string;
  Icon: LucideIcon;
  active: boolean;
  choose: () => void;
}>) {
  return (
    <button aria-pressed={active} data-hint={label} data-hint-detail={hint} onClick={choose}>
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

/** Settings that only one tool has sit directly beneath the palette. */
function ToolOptions({ props }: Readonly<{ props: Props }>) {
  const { tool, actions, settings } = props;
  const spec = DRAWING_TOOLS[tool];
  if (tool === "eyedropper")
    return (
      <div className="drawing-options tool-options" role="group" aria-label="Sample into">
        <span>Sample into</span>
        <button
          aria-pressed={props.colorTarget === "color"}
          onClick={() => actions.target("color")}
        >
          Stroke
        </button>
        <button aria-pressed={props.colorTarget === "fill"} onClick={() => actions.target("fill")}>
          Fill
        </button>
      </div>
    );
  if (spec.family !== "highlight" && tool !== "vector") return null;
  return (
    <div className="tool-options">
      {spec.family === "highlight" && (
        <div className="drawing-instruments" role="group" aria-label="Highlight tools">
          {(["marker", "highlightShape", "outline"] as DrawingTool[]).map((id) => (
            <Instrument key={id} id={id} active={tool === id} choose={actions.tool} />
          ))}
        </div>
      )}
      {["vector", "highlightShape"].includes(tool) && (
        <Geometry settings={settings} change={actions.change} />
      )}
    </div>
  );
}

function Instrument({
  id,
  active,
  choose,
}: Readonly<{ id: DrawingTool; active: boolean; choose: (tool: DrawingTool) => void }>) {
  const spec = DRAWING_TOOLS[id];
  const Icon = TOOL_ICONS[id];
  return (
    <button
      aria-pressed={active}
      data-hint={spec.label}
      data-hint-detail={spec.hint}
      onClick={() => choose(id)}
    >
      <Icon size={15} />
      <span>{spec.label}</span>
    </button>
  );
}

function Geometry({
  settings,
  change,
}: Readonly<{ settings: InkSettings; change: DrawingActions["change"] }>) {
  return (
    <>
      <div className="drawing-geometries" role="group" aria-label="Vector shapes">
        {DRAWING_SHAPES.map(({ id, label }) => {
          const Icon = SHAPE_ICONS[id];
          return (
            <button
              key={id}
              aria-label={label}
              aria-pressed={settings.shape === id}
              data-hint={label}
              onClick={() => change({ shape: id })}
            >
              <Icon size={17} />
            </button>
          );
        })}
      </div>
      {settings.shape === "polygon" && (
        <p className="drawing-hint">Click corners. Enter closes the polygon; Escape cancels it.</p>
      )}
    </>
  );
}

/** One paint section: the next mark's brush, or the selected ink's paint and moves. */
function paintTarget({ selection, armed, tool, settings }: Props) {
  if (selection.settings && (!armed || tool === "lasso"))
    return { editing: true, shown: selection.settings, closed: selection.closed };
  const closed = ["rectangle", "ellipse", "polygon", "cloud"].includes(settings.shape);
  return { editing: false, shown: settings, closed };
}

function ToolPaint({ props }: Readonly<{ props: Props }>) {
  const { actions, tool } = props;
  const { editing, shown, closed } = paintTarget(props);
  if (!editing && props.armed && tool === "eyedropper") return null;
  return (
    <section className="drawing-block" aria-label={editing ? "Selected ink" : "Brush"}>
      <PaintHeading editing={editing} props={props} />
      <BrushControls
        settings={shown}
        change={editing ? actions.style : actions.change}
        recent={props.recent}
        selected={editing}
        closed={closed}
        onTarget={actions.target}
        onClose={actions.close}
      />
      {editing ? (
        <DrawingObjectActions selection={props.selection} actions={actions} />
      ) : (
        <SavedBrushes favorites={props.favorites} actions={actions} />
      )}
    </section>
  );
}

function PaintHeading({ editing, props }: Readonly<{ editing: boolean; props: Props }>) {
  const spec = DRAWING_TOOLS[props.tool];
  if (editing)
    return (
      <>
        <h3>
          Selected ink <span className="rail-count">{props.selection.strokes}</span>
        </h3>
        {props.selection.strokes > 1 && (
          <p className="drawing-hint">
            Controls show the first path. Edits apply to all selected paths.
          </p>
        )}
      </>
    );
  return (
    <>
      <h3>{spec.family ? "Brush" : spec.label}</h3>
      {spec.family && <StrokePreview settings={props.settings} />}
    </>
  );
}

function SavedBrushes({ favorites, actions }: Readonly<Pick<Props, "favorites" | "actions">>) {
  return (
    <details className="drawing-group saved-brushes">
      <summary>Saved brushes</summary>
      <p className="drawing-hint">
        Click a brush to use it. Save replaces that brush with your current settings, on this
        device.
      </p>
      {favorites.map((favorite, index) => (
        <div className="saved-brush" key={index}>
          <button
            aria-label={`Use saved brush ${index + 1}`}
            onClick={() => actions.favorite(index, false)}
          >
            <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true">
              <path
                d="M4 17 Q14 3 21 12 T36 7"
                fill="none"
                stroke={favorite.color}
                strokeWidth={Math.min(favorite.width, 12)}
                strokeOpacity={favorite.opacity / 100}
                strokeLinecap="round"
              />
            </svg>
            <span>
              {DRAWING_TOOLS[drawingToolOf(favorite)].label}
              <small>
                {DRAWING_SHAPES.find(({ id }) => id === favorite.shape)?.label ?? "Freehand"},{" "}
                {favorite.width} px
              </small>
            </span>
          </button>
          <button
            aria-label={`Replace saved brush ${index + 1}`}
            data-hint="Replace saved brush"
            data-hint-detail="Save current brush settings in this slot, on this device."
            onClick={() => actions.favorite(index, true)}
          >
            <Save size={13} />
            Save
          </button>
        </div>
      ))}
    </details>
  );
}

function DrawingObjectActions({
  selection,
  actions,
}: Readonly<{
  selection: Props["selection"];
  actions: Pick<DrawingActions, "promote" | "demote">;
}>) {
  if (!selection.canPromote && !selection.canDemote) return null;
  return (
    <div className="drawing-object-actions">
      {selection.canPromote && <button onClick={actions.promote}>Move to content layer</button>}
      {selection.canDemote && <button onClick={actions.demote}>Move to Markup</button>}
    </div>
  );
}
