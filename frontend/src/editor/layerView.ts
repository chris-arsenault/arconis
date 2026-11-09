import type { CanvasDocument } from "../document/canvasDocument";
import { BASE_LAYER, hiddenByLayers } from "../document/layers";

/**
 * What a picture export covers: the selection, or with layers hidden, everything this person sees.
 * Null when hidden layers leave nothing to draw. Canvas files always carry every layer.
 */
export function pictureScope(document: CanvasDocument, view: LayerView, selection: string[]) {
  if (selection.length || !view.hidden.size) return selection;
  const items = document.list();
  const off = hiddenByLayers(items, view.hidden, document.layerList());
  const ids = items.filter((item) => !off.has(item.id)).map((item) => item.id);
  return ids.length ? ids : null;
}

/**
 * This person's view of the layers: which are hidden and which receives new objects. Neither is
 * shared; hiding a layer never hides it for anyone else.
 */
export class LayerView {
  private hiddenIds = new Set<string>();

  constructor(
    private readonly document: CanvasDocument,
    private readonly changed: () => void
  ) {}

  get hidden(): ReadonlySet<string> {
    return this.hiddenIds;
  }

  /** The layer new objects go into; a layer someone deleted falls back to the base layer. */
  get active() {
    const id = this.document.activeLayer;
    return this.document.layers.has(id) || id === BASE_LAYER ? id : BASE_LAYER;
  }

  isHidden(id: string) {
    return this.hiddenIds.has(id);
  }

  setHidden(id: string, hidden: boolean) {
    if (hidden === this.hiddenIds.has(id)) return;
    this.hiddenIds = new Set(this.hiddenIds);
    if (hidden) this.hiddenIds.add(id);
    else this.hiddenIds.delete(id);
    this.changed();
  }

  setActive(id: string) {
    if (this.document.activeLayer === id) return;
    this.document.activeLayer = id;
    this.changed();
  }
}
