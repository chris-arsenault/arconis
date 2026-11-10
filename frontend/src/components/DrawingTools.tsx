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

export interface DrawingActions {
  tool: (tool: DrawingTool) => void;
  family: (family: DrawingFamily) => void;
  target: (target: "color" | "fill") => void;
  change: (settings: Partial<InkSettings>) => void;
  favorite: (index: number, save: boolean) => void;
}
interface Props {
  tool: DrawingTool;
  armed: boolean;
  /** The active layer's name: Draw always paints into the layer chosen in Layers. */
  layer: string;
  colorTarget: "color" | "fill";
  settings: InkSettings;
  favorites: InkSettings[];
  recent: string[];
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
 * The panel is always about the next mark: which tool, that tool's options, then the brush.
 * Ink that is already on the canvas is edited in the property panel, like any selection.
 */
export function DrawingTools(props: Readonly<Props>) {
  return (
    <div className="drawing-tools">
      <ToolPalette props={props} />
      <ToolPaint props={props} />
    </div>
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
      <p className="drawing-hint">{armed ? spec.hint : "Choose a tool to start drawing."}</p>
      <p className="drawing-hint drawing-layer" data-testid="drawing-layer">
        Draws into <strong>{props.layer}</strong>, the layer chosen in Layers.
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
          data-hint-detail="Picked colors become the stroke color."
          onClick={() => actions.target("color")}
        >
          Stroke
        </button>
        <button
          aria-pressed={props.colorTarget === "fill"}
          data-hint-detail="Picked colors become the fill color."
          onClick={() => actions.target("fill")}
        >
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
              data-hint-detail="Draw this shape with the next drag."
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

const CLOSED_SHAPES = ["rectangle", "ellipse", "polygon", "cloud"];
const noop = () => {};

/**
 * The next mark's paint. Pick color and Select ink paint nothing, so they show only the saved
 * brushes, which lead back to a brush.
 */
function ToolPaint({ props }: Readonly<{ props: Props }>) {
  const { actions, tool, settings } = props;
  const spec = DRAWING_TOOLS[tool];
  const paints = tool !== "eyedropper" && tool !== "lasso";
  return (
    <section className="drawing-block" aria-label="Brush">
      {paints && (
        <>
          <h3>{spec.family ? "Brush" : spec.label}</h3>
          {spec.family && <StrokePreview settings={settings} />}
          <BrushControls
            settings={settings}
            change={actions.change}
            recent={props.recent}
            selected={false}
            closed={CLOSED_SHAPES.includes(settings.shape)}
            onTarget={actions.target}
            onClose={noop}
          />
        </>
      )}
      <SavedBrushes favorites={props.favorites} actions={actions} />
    </section>
  );
}

function SavedBrushes({ favorites, actions }: Readonly<Pick<Props, "favorites" | "actions">>) {
  return (
    <details className="drawing-group saved-brushes">
      <summary data-hint-detail="Brush settings kept in slots on this device for quick reuse.">
        Saved brushes
      </summary>
      <p className="drawing-hint">
        Click a brush to use it. Save replaces that brush with your current settings, on this
        device.
      </p>
      {favorites.map((favorite, index) => (
        <div className="saved-brush" key={index}>
          <button
            aria-label={`Use saved brush ${index + 1}`}
            data-hint-detail="Draw with this saved brush's tool, color, width and opacity."
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
