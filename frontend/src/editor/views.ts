import type { Graph } from "@maxgraph/core";
import { worldBounds } from "../document/relations";
import type { Item, View } from "../document/types";
import { clampScale } from "./zoom";

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
  graph.view.scaleAndTranslate(scale, 60 / scale - bounds.x, 60 / scale - bounds.y);
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

/** Animates to a saved view, centered in the current window whatever its size. */
export function flyToView(graph: Graph, element: HTMLElement, view: View) {
  const start = viewportCenter(graph, element);
  const target = view.center;
  const startScale = graph.view.scale;
  const place = (scale: number, x: number, y: number) =>
    graph.view.scaleAndTranslate(
      scale,
      element.clientWidth / 2 / scale - x,
      element.clientHeight / 2 / scale - y
    );
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    place(view.zoom, target.x, target.y);
    return;
  }
  const began = performance.now();
  const step = (now: number) => {
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
