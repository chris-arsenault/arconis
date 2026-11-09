import type { InkSettings } from "../editor/inkCommands";
import { BrushControls, SHAPES } from "./BrushControls";
import {
  Circle,
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
  change: (settings: Partial<InkSettings>) => void;
  favorite: (index: number, save: boolean) => void;
  toggle: () => void;
  clear: () => void;
  recolor: () => void;
  make: () => void;
  blank: () => void;
  leave: () => void;
  fit: () => void;
  demote: () => void;
  fill: () => void;
  close: () => void;
}
interface Props {
  settings: InkSettings;
  visible: boolean;
  activeSketch: string;
  favorites: InkSettings[];
  recent: string[];
  selection: { canPromote: boolean; hasDrawing: boolean; strokes: number };
  markupCount: number;
  actions: DrawingActions;
}
const MODES: [InkSettings["mode"], string, LucideIcon, string][] = [
  ["pen", "Pen", Pencil, "Drag to draw. Hold Shift to constrain a shape."],
  ["highlighter", "Highlighter", Highlighter, "Drag to draw translucent strokes or shapes."],
  [
    "highlight",
    "Highlight object",
    ScanLine,
    "Click an object to add or remove an outline that follows it.",
  ],
  ["lasso", "Lasso", Lasso, "Drag around whole strokes to select them. Hold Shift to add more."],
  ["eraser", "Eraser", Eraser, "Drag across a stroke to erase the whole stroke."],
  [
    "precision",
    "Precision eraser",
    Scissors,
    "Drag to cut away only the parts of strokes you touch.",
  ],
  [
    "fill",
    "Fill",
    PaintBucket,
    "Click inside a closed path to fill it with the current ink color.",
  ],
  ["eyedropper", "Eyedropper", Pipette, "Click a drawing or object to pick its color."],
];
/** Leaf controls receive semantic preferences and a focused drawing command port. */
export function DrawingTools(props: Readonly<Props>) {
  const { settings, actions } = props;
  const change = actions.change;
  return (
    <div className="drawing-tools">
      {props.activeSketch && (
        <button className="finish-drawing" onClick={actions.leave}>
          Finish drawing
        </button>
      )}
      <div className="drawing-instruments" role="group" aria-label="Drawing instruments">
        {MODES.map(([mode, label, Icon, hint]) => (
          <button
            key={mode}
            data-hint={label}
            data-hint-detail={hint}
            aria-pressed={settings.mode === mode}
            onClick={() => change({ mode })}
          >
            <Icon size={18} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p className="drawing-hint instrument-hint">
        {MODES.find(([mode]) => mode === settings.mode)?.[3]}
      </p>
      <BrushControls
        settings={settings}
        change={change}
        recent={props.recent}
        selected={props.selection.strokes > 0}
        onFill={actions.fill}
        onClose={actions.close}
      />
      <SavedBrushes favorites={props.favorites} actions={actions} />
      {props.selection.strokes > 0 && (
        <section className="drawing-selection" aria-label="Selected strokes">
          <h3>
            {props.selection.strokes} selected{" "}
            {props.selection.strokes === 1 ? "stroke" : "strokes"}
          </h3>
          <button onClick={actions.recolor}>
            <Circle size={14} fill={settings.color} color={settings.color} />
            Apply ink color to strokes
          </button>
          <p className="drawing-hint">Changes the outline color of the selected strokes.</p>
        </section>
      )}
      <DrawingObjectActions
        active={!!props.activeSketch}
        selection={props.selection}
        actions={actions}
      />
      {!props.activeSketch && (
        <AnnotationActions
          visible={props.visible}
          markupCount={props.markupCount}
          actions={actions}
        />
      )}
    </div>
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
                strokeOpacity={favorite.mode === "highlighter" ? 0.4 : 1}
                strokeLinecap="round"
              />
            </svg>
            <span>
              {MODES.find(([mode]) => mode === favorite.mode)?.[1]}
              <small>
                {SHAPES.find(([shape]) => shape === favorite.shape)?.[1]}, {favorite.width} px
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
  active,
  selection,
  actions,
}: Readonly<{
  active: boolean;
  selection: Props["selection"];
  actions: Pick<DrawingActions, "make" | "blank" | "fit" | "demote" | "leave">;
}>) {
  return (
    <div className="drawing-object-actions">
      {selection.canPromote && <button onClick={actions.make}>Make Drawing</button>}
      {!active && (
        <>
          <button onClick={actions.blank}>
            <Pencil size={14} />
            New Drawing
          </button>
          <p className="drawing-hint">
            A drawing object keeps editable strokes together so you can move and connect them.
          </p>
        </>
      )}
      {selection.hasDrawing && (
        <>
          <button onClick={actions.fit}>Fit bounds to drawing</button>
          <button onClick={actions.demote}>Return to markup</button>
        </>
      )}
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
        Removes annotations for everyone. Drawing objects stay. Undo restores annotations.
      </p>
    </section>
  );
}
