import type { Graph } from "@maxgraph/core";
import { worldBounds } from "../document/relations";
import type { CanvasObject, SavedView } from "../document/types";
import { clampScale } from "./zoom";

const FLY_MS = 350;

/** Measures from the document, because objects too small to draw can still be all there is. */
export function fitContents(graph: Graph, element: HTMLElement, items: CanvasObject[]) {
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

export function createView(graph: Graph, element: HTMLElement, name: string): SavedView {
  const { scale, translate } = graph.view;
  const center = viewportCenter(graph, element);
  return {
    id: crypto.randomUUID(),
    name,
    scale,
    x: translate.x,
    y: translate.y,
    centerX: center.x,
    centerY: center.y,
  };
}

function targetCenter(view: SavedView, element: HTMLElement) {
  return {
    x: view.centerX ?? element.clientWidth / 2 / view.scale - view.x,
    y: view.centerY ?? element.clientHeight / 2 / view.scale - view.y,
  };
}

/** Animates to a saved view, centered in the current window whatever its size. */
export function flyToView(graph: Graph, element: HTMLElement, view: SavedView) {
  const start = viewportCenter(graph, element);
  const target = targetCenter(view, element);
  const startScale = graph.view.scale;
  const place = (scale: number, x: number, y: number) =>
    graph.view.scaleAndTranslate(
      scale,
      element.clientWidth / 2 / scale - x,
      element.clientHeight / 2 / scale - y
    );
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    place(view.scale, target.x, target.y);
    return;
  }
  const began = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - began) / FLY_MS);
    const eased = 1 - (1 - progress) ** 3;
    place(
      startScale * (view.scale / startScale) ** eased,
      start.x + (target.x - start.x) * eased,
      start.y + (target.y - start.y) * eased
    );
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
