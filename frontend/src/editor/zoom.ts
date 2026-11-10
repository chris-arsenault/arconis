import type { Graph } from "@maxgraph/core";
import { isBox, type Item, type ItemType, type Stencil } from "../document/types";
import { defaultSize } from "../document/canvasDocument";

export const MIN_SCALE = 2 ** -20;
export const MAX_SCALE = 2 ** 20;
export const ZOOM_STEP = 2 ** 0.25;
const GRID_PIXELS = 10;
const MAJOR_LINE_EVERY = 10;
type ViewportElement = Pick<HTMLElement, "clientWidth" | "clientHeight">;
const viewportSizes = new WeakMap<ViewportElement, { width: number; height: number }>();

/** Keep layout reads out of view-update consumers after the graph has changed the DOM. */
export function viewportSize(element: ViewportElement) {
  return viewportSizes.get(element) ?? { width: element.clientWidth, height: element.clientHeight };
}

/** World coordinates of a pointer event, free of the grid snap used for placing objects. */
export function worldPointOf(
  graph: Graph,
  element: HTMLElement,
  event: { clientX: number; clientY: number }
) {
  const bounds = element.getBoundingClientRect();
  const { scale, translate } = graph.view;
  return {
    x: (event.clientX - bounds.left - graph.getPanDx()) / scale - translate.x,
    y: (event.clientY - bounds.top - graph.getPanDy()) / scale - translate.y,
  };
}

export function observeViewport(element: HTMLElement, changed: (dx: number, dy: number) => void) {
  viewportSizes.set(element, { width: element.clientWidth, height: element.clientHeight });
  const observer = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    const height = entry.contentRect.height;
    const previous = viewportSizes.get(element);
    if (previous?.width === width && previous.height === height) return;
    viewportSizes.set(element, { width, height });
    changed(
      previous ? (width - previous.width) / 2 : 0,
      previous ? (height - previous.height) / 2 : 0
    );
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    viewportSizes.delete(element);
  };
}

export function clampScale(scale: number) {
  if (Number.isNaN(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** A layout resize preserves the world point at the center, without changing magnification. */
export function observeGraphViewport(graph: Graph, element: HTMLElement, changed: () => void) {
  let windowWidth = window.innerWidth,
    windowHeight = window.innerHeight;
  return observeViewport(element, (dx, dy) => {
    const view = graph.view;
    const resizedWindow = windowWidth !== window.innerWidth || windowHeight !== window.innerHeight;
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    if (resizedWindow)
      view.setTranslate(view.translate.x + dx / view.scale, view.translate.y + dy / view.scale);
    view.revalidate();
    changed();
  });
}

export function zoomLabel(scale: number) {
  return `${Number(scale.toPrecision(4))}×`;
}

/** maxGraph's zoom helper rounds to hundredths. Its view API preserves the requested scale. */
export function zoomAt(
  graph: Graph,
  scale: number,
  anchor = {
    x: viewportSize(graph.container).width / 2,
    y: viewportSize(graph.container).height / 2,
  }
) {
  const view = graph.view;
  const world = {
    x: anchor.x / view.scale - view.translate.x,
    y: anchor.y / view.scale - view.translate.y,
  };
  const next = clampScale(scale);
  view.scaleAndTranslate(next, anchor.x / next - world.x, anchor.y / next - world.y);
}

/** Keeps the snapping grid about the same size on screen at every zoom. */
export function gridForScale(scale: number) {
  return 10 ** Math.round(Math.log10(GRID_PIXELS / scale));
}

/** Rounds a world coordinate finely enough for sub-pixel accuracy at this zoom. */
export function roundForScale(value: number, scale: number) {
  const precision = 10 ** Math.max(2, Math.ceil(Math.log10(scale)) + 2);
  return Math.round(value * precision) / precision;
}

/** New objects appear at a familiar on-screen size, in steps so nearby zooms give equal sizes. */
function creationFactor(scale: number) {
  return 2 ** -Math.round(Math.log2(scale));
}

export function creationOffset(scale: number) {
  return creationFactor(scale);
}

/** The world size of a new item at this zoom. */
export function creationSize(type: ItemType, scale: number, stencil?: Stencil) {
  const factor = creationFactor(scale);
  const [width, height] = defaultSize(type, stencil);
  return { width: width * factor, height: height * factor };
}

/** Size and scale for an item created at this zoom. Empty near 100%. */
export function creationValues(type: ItemType, scale: number, stencil?: Stencil): Partial<Item> {
  const factor = creationFactor(scale);
  if (factor === 1) return {};
  const look = { scale: factor };
  if (!isBox({ type })) return { look };
  return { ...creationSize(type, scale, stencil), look };
}

/** Applies the parts of the view that follow zoom: the snapping grid and its visible lines. */
export function syncZoom(
  graph: Graph,
  element: HTMLElement,
  snap = gridForScale(graph.view.scale),
  visible = snap
) {
  const { scale, translate } = graph.view;
  graph.setGridSize(snap);
  // Grid intervals come from calibrated display units. The first
  // two background layers are major lines and the last two minor, as `.canvas-surface` declares.
  const minor = Math.max(visible, snap) * scale;
  const major = minor * MAJOR_LINE_EVERY;
  const size = (spacing: number) => `${spacing}px ${spacing}px`;
  const position = (spacing: number) =>
    `${(translate.x * scale + graph.getPanDx()) % spacing}px ${(translate.y * scale + graph.getPanDy()) % spacing}px`;
  element.style.backgroundSize = [major, major, minor, minor].map(size).join(",");
  element.style.backgroundPosition = [major, major, minor, minor].map(position).join(",");
}
