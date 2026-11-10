import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { newId } from "../document/ids";
import { worldBounds } from "../document/relations";
import { LOCAL, type Item, type View } from "../document/types";
import { clampScale, viewportSize } from "./zoom";
import { viewHistoryOf } from "./viewHistory";
import { CULL_PIXELS } from "./culling";

const FLY_MS = 350;

/** Measures from the document, because objects too small to draw can still be all there is. */
export function fitContents(graph: Graph, element: HTMLElement, items: Item[]) {
  // An explicit Fit replaces a link/search flight that may still be animating.
  flight += 1;
  const bounds = worldBounds(items);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const { clientWidth: width, clientHeight: height } = element;
  const scale = clampScale(
    Math.min(2, (width - 120) / bounds.width, (height - 120) / bounds.height)
  );
  viewHistoryOf(graph)?.record();
  graph.view.scaleAndTranslate(scale, 60 / scale - bounds.x, 60 / scale - bounds.y);
}

/** Whether any of these items would show in the window as it is. */
export function anythingInView(graph: Graph, element: HTMLElement, items: Item[]) {
  const { scale, translate } = graph.view;
  const { width, height } = viewportSize(element);
  const window = {
    x: -translate.x,
    y: -translate.y,
    width: width / scale,
    height: height / scale,
  };
  return items.some((item) => {
    if (!hasPaintedState(graph, item.id)) return false;
    const box = worldBounds([item]);
    return (
      box !== null &&
      !item.hidden &&
      Math.max(box.width, box.height) * scale >= CULL_PIXELS &&
      box.x < window.x + window.width &&
      box.x + box.width > window.x &&
      box.y < window.y + window.height &&
      box.y + box.height > window.y
    );
  });
}

function hasPaintedState(graph: Graph, id: string) {
  const cell = graph.getDataModel().getCell(id);
  const state = cell && graph.view.getState(cell);
  return Boolean(state && state.shape?.node?.style.display !== "none");
}

function viewportCenter(graph: Graph, element: HTMLElement) {
  const { scale, translate } = graph.view;
  const { clientWidth: width, clientHeight: height } = element;
  return {
    x: width / 2 / scale - translate.x,
    y: height / 2 / scale - translate.y,
  };
}

export function createView(graph: Graph, element: HTMLElement, name: string): Omit<View, "id"> {
  return { name, zoom: graph.view.scale, center: viewportCenter(graph, element) };
}

export function savedViews(document: CanvasDocument) {
  return [...document.views.values()];
}
function writeView(document: CanvasDocument, view: View) {
  document.doc.transact(() => document.views.set(view.id, view), LOCAL);
}
/** Saves the window's current place and zoom under a name, shared with the room. */
export function saveCurrentView(editor: Viewer, name: string) {
  writeView(editor.document, {
    ...createView(editor.graph, editor.element, name),
    id: newId((id) => editor.document.views.has(id)),
  });
}
export function renameView(document: CanvasDocument, view: View, name: string) {
  writeView(document, { ...view, name });
}
export function removeView(document: CanvasDocument, id: string) {
  document.doc.transact(() => document.views.delete(id), LOCAL);
}

/** What flying and saving views need from the editor. */
export interface Viewer {
  graph: Graph;
  element: HTMLElement;
  document: CanvasDocument;
}

/** The view centered on a box that fills `fill` of the window's narrower dimension. */
export function fittingView(
  box: Pick<Item, "x" | "y" | "width" | "height">,
  element: Pick<HTMLElement, "clientWidth" | "clientHeight">,
  fill: number
): View {
  const { clientWidth: width, clientHeight: height } = element;
  const zoom = clampScale(Math.min((width * fill) / box.width, (height * fill) / box.height));
  return {
    id: "",
    name: "",
    center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    zoom,
  };
}

/** The latest flight; an earlier one still animating stops when a new one begins. */
let flight = 0;

/** Animates to a saved view, centered in the current window whatever its size. */
export function flyToView(graph: Graph, element: HTMLElement, view: View, animate = true) {
  viewHistoryOf(graph)?.record();
  const id = ++flight;
  const start = viewportCenter(graph, element);
  const target = view.center;
  const startScale = graph.view.scale;
  const place = (scale: number, x: number, y: number, size = viewportSize(element)) => {
    const { width, height } = size;
    graph.view.scaleAndTranslate(
      clampScale(scale),
      width / 2 / clampScale(scale) - x,
      height / 2 / clampScale(scale) - y
    );
  };
  if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // Layout effects can fit a slide before ResizeObserver reports the chrome disappearing.
    place(view.zoom, target.x, target.y, {
      width: element.clientWidth,
      height: element.clientHeight,
    });
    return;
  }
  const began = performance.now();
  const step = (now: number) => {
    if (id !== flight) return;
    const progress = Math.min(1, (now - began) / FLY_MS);
    const eased = 1 - (1 - progress) ** 3;
    place(
      startScale * (view.zoom / startScale) ** eased,
      start.x + (target.x - start.x) * eased,
      start.y + (target.y - start.y) * eased
    );
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
