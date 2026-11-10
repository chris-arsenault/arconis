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
  Pipette,
  Save,
  ScanLine,
  Scissors,
  Trash2,
  type LucideIcon,
} from "lucide-react";

export interface DrawingActions {
  tool: (tool: DrawingTool) => void;
  family: (family: DrawingFamily) => void;
  style: (settings: Partial<InkSettings>) => void;
  target: (target: "color" | "fill") => void;
  change: (settings: Partial<InkSettings>) => void;
  favorite: (index: number, save: boolean) => void;
  toggle: () => void;
  clear: () => void;
  promote: () => void;
  demote: () => void;
  close: () => void;
}
interface Props {
  tool: DrawingTool;
  armed: boolean;
  target: string;
  colorTarget: "color" | "fill";
  settings: InkSettings;
  visible: boolean;
  favorites: InkSettings[];
  recent: string[];
  selection: {
    canPromote: boolean;
    canDemote: boolean;
    strokes: number;
    settings: InkSettings | null;
    closed: boolean;
  };
  markupCount: number;
  actions: DrawingActions;
}
const TOOL_ICONS: Record<DrawingTool, LucideIcon> = {
  freehand: Pencil,
  marker: Highlighter,
  highlightShape: RectangleHorizontal,
  outline: ScanLine,
  vector: Pentagon,
  lasso: Lasso,
  eraser: Eraser,
  precision: Scissors,
  fill: PaintBucket,
  eyedropper: Pipette,
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
/** Leaf controls receive semantic preferences and a focused drawing command port. */
export function DrawingTools(props: Readonly<Props>) {
  const { actions } = props;
  return (
    <div className="drawing-tools">
      <ToolPalette props={props} />
      <ToolPaint props={props} />
      <SavedBrushes favorites={props.favorites} actions={actions} />
      <DrawingObjectActions selection={props.selection} actions={actions} />
      <AnnotationActions
        visible={props.visible}
        markupCount={props.markupCount}
        actions={actions}
      />
    </div>
  );
}

function ToolPaint({ props }: Readonly<{ props: Props }>) {
  const { settings, actions, tool } = props;
  if (tool === "eyedropper" && props.armed)
    return (
      <div className="drawing-options" role="group" aria-label="Sample into">
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
  const editing = props.selection.settings && (!props.armed || tool === "lasso");
  const shown = editing ? props.selection.settings! : settings;
  const change = editing ? actions.style : actions.change;
  const closed = editing
    ? props.selection.closed
    : ["rectangle", "ellipse", "polygon", "cloud"].includes(settings.shape);
  return (
    <>
      <PaintHeading editing={Boolean(editing)} props={props} />
      <BrushControls
        settings={shown}
        change={change}
        recent={props.recent}
        selected={Boolean(editing)}
        closed={closed}
        onTarget={actions.target}
        onClose={actions.close}
      />
    </>
  );
}

function PaintHeading({ editing, props }: Readonly<{ editing: boolean; props: Props }>) {
  const spec = DRAWING_TOOLS[props.tool];
  if (editing)
    return (
      <>
        <h3>Selected ink · {props.selection.strokes} paths</h3>
        {props.selection.strokes > 1 && (
          <p className="drawing-hint">
            Controls show the first path. Edits apply to all selected paths.
          </p>
        )}
      </>
    );
  return (
    <>
      <h3>{spec.family ? "Next mark" : spec.label}</h3>
      {spec.family && <StrokePreview settings={props.settings} />}
    </>
  );
}

function ToolPalette({ props }: Readonly<{ props: Props }>) {
  const { settings, actions, tool } = props;
  const spec = DRAWING_TOOLS[tool];
  return (
    <>
      <div className="drawing-families" role="group" aria-label="Drawing families">
        {DRAWING_FAMILIES.map(({ id, label }) => (
          <button
            key={id}
            aria-pressed={props.armed && spec.family === id}
            onClick={() => actions.family(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {props.armed && spec.family === "highlight" && (
        <div className="drawing-instruments" role="group" aria-label="Highlight tools">
          {(["marker", "highlightShape", "outline"] as DrawingTool[]).map((id) => (
            <Instrument key={id} id={id} active={tool === id} choose={actions.tool} />
          ))}
        </div>
      )}
      {props.armed && ["vector", "highlightShape"].includes(tool) && (
        <Geometry settings={settings} change={actions.change} />
      )}
      <p className="drawing-hint drawing-target">Drawing on: {props.target}</p>
      <div className="drawing-utilities" role="group" aria-label="Edit ink">
        {DRAWING_UTILITIES.map((id) => (
          <Instrument key={id} id={id} active={props.armed && tool === id} choose={actions.tool} />
        ))}
      </div>
      <p className="drawing-hint instrument-hint">
        {props.armed ? spec.hint : "Select an object or choose a drawing tool."}
      </p>
    </>
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
      <Icon size={17} />
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
              onClick={() => change({ shape: id })}
            >
              <Icon size={18} />
              <span>{label}</span>
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
  return (
    <div className="drawing-object-actions">
      {selection.canPromote && <button onClick={actions.promote}>Move to content layer</button>}
      {selection.canDemote && <button onClick={actions.demote}>Move to Markup</button>}
    </div>
  );
}

function AnnotationActions(props: Readonly<Pick<Props, "visible" | "markupCount" | "actions">>) {
  const { actions } = props;
  return (
    <section className="annotation-actions" aria-label="Canvas annotations">
      <h3>
        Canvas annotations <span className="rail-count">{props.markupCount}</span>
      </h3>
      <label className="annotation-visibility">
        <input type="checkbox" checked={props.visible} onChange={actions.toggle} />
        Show annotations
      </label>
      <p className="drawing-hint">Visibility changes only your view.</p>
      <button className="delete-annotations" disabled={!props.markupCount} onClick={actions.clear}>
        <Trash2 size={14} />
        Delete all annotations
      </button>
      <p className="drawing-hint">
        Removes annotations for everyone. Content layers stay. Undo restores annotations.
      </p>
    </section>
  );
}
