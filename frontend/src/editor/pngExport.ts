import type { Cell, Graph } from "@maxgraph/core";
import { worldBounds } from "../document/relations";
import type { Item } from "../document/types";
import { exportItems } from "../document/exportItems";
import { exportTextCss } from "./exportText";
import { exportMarkup } from "./culling";

const MARGIN_PIXELS = 20;
const HIDE_ATTRIBUTE = "data-export-hidden";
/** Sharper than the screen for an ordinary canvas, and within what browsers can allocate. */
const PREFERRED_SCALE = 2;
const MAX_SIDE_PIXELS = 8000;
/** Small canvases grow to this, so one drawn at deep zoom still exports legibly. */
const MIN_SIDE_PIXELS = 800;

interface WorldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Scale for an export of this size, as pure arithmetic. */
export function exportScale(width: number, height: number) {
  const side = Math.max(width, height, Number.MIN_VALUE);
  const scale = Math.min(PREFERRED_SCALE, MAX_SIDE_PIXELS / side);
  return side * scale < MIN_SIDE_PIXELS ? MIN_SIDE_PIXELS / side : scale;
}

function drawnBounds(graph: Graph, cells: Cell[]): WorldBox | null {
  const box = graph.getBoundingBox(cells);
  if (!box) return null;
  const { scale, translate } = graph.view;
  return {
    x: box.x / scale - translate.x,
    y: box.y / scale - translate.y,
    width: box.width / scale,
    height: box.height / scale,
  };
}

function shownCells(graph: Graph, shown: Set<string>) {
  const cells = graph.getChildCells(graph.getDefaultParent(), true, true);
  const all: Cell[] = [];
  const walk = (cell: Cell) => {
    all.push(cell);
    cell.children?.forEach(walk);
  };
  cells.forEach(walk);
  return all.filter((cell) => !shown.size || shown.has(cell.id ?? ""));
}

/** Copies the draw pane, leaving out selection handles and anything not being exported. */
function cloneDrawPane(graph: Graph, cells: Set<Cell>) {
  const hidden: Element[] = [];
  graph.view.states.forEach((state, cell) => {
    if (cells.has(cell)) return;
    for (const node of [state.shape?.node, state.text?.node]) {
      if (!node) continue;
      node.setAttribute(HIDE_ATTRIBUTE, "");
      hidden.push(node);
    }
  });
  const pane = graph.view.getDrawPane()!.cloneNode(true) as Element;
  hidden.forEach((node) => node.removeAttribute(HIDE_ATTRIBUTE));
  pane.querySelectorAll(`[${HIDE_ATTRIBUTE}]`).forEach((node) => node.remove());
  return pane;
}

/** Renders at the export's scale, then returns the view to where the person left it. */
function renderSvg(graph: Graph, cells: Cell[], box: WorldBox) {
  const { view } = graph;
  const { scale: viewScale, translate } = view;
  const [viewX, viewY] = [translate.x, translate.y];
  const scale = exportScale(box.width, box.height);
  const margin = MARGIN_PIXELS / scale;
  const width = Math.ceil((box.width + margin * 2) * scale);
  const height = Math.ceil((box.height + margin * 2) * scale);
  view.scaleAndTranslate(scale, margin - box.x, margin - box.y);
  const pane = cloneDrawPane(graph, new Set(cells));
  const defs = graph.view.getDrawPane()?.closest("svg")?.querySelectorAll(":scope > defs");
  defs?.forEach((definition) => pane.prepend(definition.cloneNode(true)));
  view.scaleAndTranslate(viewScale, viewX, viewY);
  return { pane, width, height };
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("A picture could not be drawn."));
    reader.readAsDataURL(blob);
  });
}

/** An SVG drawn as an image cannot load anything else, so pictures go inline. */
async function inlinePictures(pane: Element) {
  const attributes = ["href", "xlink:href"];
  for (const image of pane.querySelectorAll("image")) {
    for (const attribute of attributes) {
      const url = image.getAttribute(attribute);
      if (!url?.startsWith("blob:")) continue;
      const blob = await (await fetch(url)).blob();
      image.setAttribute(attribute, await readDataUrl(blob));
    }
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The canvas could not be drawn as a picture."));
    image.src = url;
  });
}

/** The rendered pane as one self-contained SVG document, pictures and text styles inline. */
async function svgDocument({ pane, width, height }: ReturnType<typeof renderSvg>, extra = "") {
  await inlinePictures(pane);
  const css = await exportTextCss(pane);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = css;
  pane.prepend(style);
  const body = new XMLSerializer().serializeToString(pane);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${extra}` +
    `<rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`
  );
}

async function rasterize(rendered: ReturnType<typeof renderSvg>) {
  const { width, height } = rendered;
  const svg = await svgDocument(rendered);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The canvas could not be drawn as a picture.");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Draws the named objects as a PNG, or the whole canvas when `ids` is empty. Returns null when there
 * is nothing to draw.
 */
export async function renderPng(graph: Graph, ids: string[], items: Item[], includeMarkup = true) {
  await document.fonts.ready;
  exportMarkup(graph, includeMarkup);
  try {
    return await renderChosen(graph, ids, items, includeMarkup);
  } finally {
    exportMarkup(graph, null);
  }
}

/** The cells and box an export of these items covers, or null when there is nothing to draw. */
function chosenScene(graph: Graph, ids: string[], items: Item[], includeMarkup: boolean) {
  const chosen = exportItems(items, ids, includeMarkup);
  if (!chosen.length) return null;
  const allowed = new Set(chosen.map((item) => item.id));
  const cells = shownCells(graph, ids.length ? allowed : new Set()).filter(
    (cell) => allowed.has(cell.id ?? "") || (cell.getStyle() as Record<string, unknown>).underlay
  );
  // Everything can be too small to draw at this zoom, while still being worth exporting.
  const box =
    drawnBounds(graph, cells) ?? worldBounds(chosen.filter((item) => item.type !== "highlight"));
  if (!box || !cells.length) return null;
  return { cells, box };
}

function renderChosen(graph: Graph, ids: string[], items: Item[], includeMarkup: boolean) {
  const scene = chosenScene(graph, ids, items, includeMarkup);
  return scene ? rasterize(renderSvg(graph, scene.cells, scene.box)) : null;
}

/**
 * Draws the named objects as an SVG document, or the whole canvas when `ids` is empty, with the
 * canvas text carried in a `desc` so the file opens again as a canvas. Null when nothing draws.
 */
export async function renderSvgFile(
  graph: Graph,
  ids: string[],
  items: Item[],
  copy: string,
  includeMarkup = true
) {
  await document.fonts.ready;
  exportMarkup(graph, includeMarkup);
  try {
    const scene = chosenScene(graph, ids, items, includeMarkup);
    if (!scene) return null;
    const desc = `<desc>${copy.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</desc>`;
    return await svgDocument(renderSvg(graph, scene.cells, scene.box), desc);
  } finally {
    exportMarkup(graph, null);
  }
}
