import { Eye, Layers, StickyNote, Trash2 } from "lucide-react";
import type { InkTarget } from "../editor/drawingTools";

export interface Destination {
  markup: boolean;
  layer: string;
  layers: { id: string; name: string }[];
  visible: boolean;
  markupCount: number;
}
export interface DestinationActions {
  destination: (target: InkTarget) => void;
  layer: (id: string) => void;
  toggle: () => void;
  clear: () => void;
}

/** Where ink goes comes first; each destination shows only the controls that act on it. */
export function DrawingDestination({
  destination,
  actions,
}: Readonly<{ destination: Destination; actions: DestinationActions }>) {
  const { markup } = destination;
  return (
    <section className="drawing-block" aria-label="Draw into">
      <h3>Draw into</h3>
      <div className="drawing-destination" role="group" aria-label="Destination">
        <button
          aria-label="Content layer (P)"
          aria-pressed={!markup}
          data-hint="Content layer (P)"
          data-hint-detail="Ink becomes part of the chosen layer, like any other object."
          onClick={() => actions.destination("draw")}
        >
          <Layers size={16} />
          <span>Layer</span>
        </button>
        <button
          aria-label="Markup (M)"
          aria-pressed={markup}
          data-hint="Markup (M)"
          data-hint-detail="Ink becomes an annotation floating above every content layer."
          onClick={() => actions.destination("markup")}
        >
          <StickyNote size={16} />
          <span>Markup</span>
        </button>
      </div>
      {markup ? (
        <MarkupControls destination={destination} actions={actions} />
      ) : (
        <label
          className="drawing-field"
          data-hint-detail="Choose the layer new ink joins; it also becomes your active layer."
        >
          Layer
          <select
            aria-label="Drawing layer"
            value={destination.layer}
            onChange={(event) => actions.layer(event.target.value)}
          >
            {destination.layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function MarkupControls({
  destination,
  actions,
}: Readonly<{ destination: Destination; actions: DestinationActions }>) {
  return (
    <div className="markup-controls">
      <label
        className="annotation-visibility"
        data-hint="Show annotations"
        data-hint-detail="Show or hide markup in your view only; others keep their own setting."
      >
        <input
          type="checkbox"
          aria-label="Show annotations"
          checked={destination.visible}
          onChange={actions.toggle}
        />
        <Eye size={14} aria-hidden="true" />
        Show <span className="rail-count">{destination.markupCount}</span>
      </label>
      <button
        className="delete-annotations"
        aria-label="Delete all annotations"
        data-hint="Delete all annotations"
        data-hint-detail="Remove every annotation for everyone; content layers stay, and Undo restores them."
        disabled={!destination.markupCount}
        onClick={actions.clear}
      >
        <Trash2 size={14} />
        Delete all
      </button>
    </div>
  );
}
