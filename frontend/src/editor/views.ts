import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { newId } from "../document/ids";
import { worldBounds } from "../document/relations";
import { LOCAL, type Item, type View } from "../document/types";
import { clampScale } from "./zoom";
import { viewHistoryOf } from "./viewHistory";

const FLY_MS = 350;

/** Measures from the document, because objects too small to draw can still be all there is. */
export function fitContents(graph: Graph, element: HTMLElement, items: Item[]) {
  const bounds = worldBounds(items);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const scale = clampScale(
    Math.min(
      2,
      (element.clientWidth - 120) / bounds.width,
      (element.clientHeight - 120) / bounds.height
    )
  );
  viewHistoryOf(graph)?.record();
  graph.view.scaleAndTranslate(scale, 60 / scale - bounds.x, 60 / scale - bounds.y);
}

/** Whether any of these items would show in the window as it is. */
export function anythingInView(graph: Graph, element: HTMLElement, items: Item[]) {
  const { scale, translate } = graph.view;
  const window = {
    x: -translate.x,
    y: -translate.y,
    width: element.clientWidth / scale,
    height: element.clientHeight / scale,
  };
  return items.some((item) => {
    const box = worldBounds([item]);
    return (
      box !== null &&
      box.x < window.x + window.width &&
      box.x + box.width > window.x &&
      box.y < window.y + window.height &&
      box.y + box.height > window.y
    );
  });
}

function viewportCenter(graph: Graph, element: HTMLElement) {
  const { scale, translate } = graph.view;
  return {
    x: element.clientWidth / 2 / scale - translate.x,
    y: element.clientHeight / 2 / scale - translate.y,
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
  const zoom = clampScale(
    Math.min((element.clientWidth * fill) / box.width, (element.clientHeight * fill) / box.height)
  );
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
  const place = (scale: number, x: number, y: number) =>
    graph.view.scaleAndTranslate(
      scale,
      element.clientWidth / 2 / scale - x,
      element.clientHeight / 2 / scale - y
    );
  if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    place(view.zoom, target.x, target.y);
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
