import {
  Cell,
  Geometry,
  Rectangle,
  VertexHandler,
  type ConnectionHandler,
  type Graph,
  type SelectionHandler,
} from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isBox } from "../document/types";
import { roundForScale } from "./zoom";

/**
 * A connector dragged into empty space ends on a new object like its source, so a chain grows
 * without reaching for the rail. Alt while resizing scales from the centre.
 */
export function configureCreateTarget(graph: Graph, document: CanvasDocument) {
  const selection = graph.getPlugin<SelectionHandler>("SelectionHandler");
  if (selection) selection.roundLength = (length) => roundForScale(length, graph.view.scale);
  const connection = graph.getPlugin<ConnectionHandler>("ConnectionHandler");
  if (!connection) return;
  connection.setCreateTarget(true);
  connection.createTargetVertex = (evt: MouseEvent, source: Cell) => {
    const item = source.id ? document.get(source.id) : null;
    const point = graph.getPointForEvent(evt);
    const width = item && isBox(item) ? item.width : 160;
    const height = item && isBox(item) ? item.height : 90;
    const style: Record<string, unknown> = { ...source.getStyle(), cloneOf: source.id };
    const vertex = new Cell(
      "",
      new Geometry(point.x - width / 2, point.y - height / 2, width, height),
      style
    );
    vertex.setVertex(true);
    vertex.setConnectable(true);
    return vertex;
  };
}

/** Alt during a resize keeps the centre where it is, growing both ways. */
export function configureCentredResize() {
  VertexHandler.prototype.isCenteredEvent = (_state, me) => Boolean(me.getEvent().altKey);
  VertexHandler.prototype.roundLength = function (length) {
    return roundForScale(length, this.graph.view.scale);
  };
  // Native union rounds unsnapped coordinates to whole world units. Keep its geometry policies,
  // but compute the moving edges with the same screen precision as drawing and dragging.
  VertexHandler.prototype.union = function (
    bounds,
    dx,
    dy,
    index,
    grid,
    scale,
    translate,
    constrained,
    centered
  ) {
    const snap = (value: number) =>
      grid && this.graph.isGridEnabled()
        ? this.graph.snap(value / scale) * scale
        : roundForScale(value, this.graph.view.scale);
    let left = bounds.x - translate.x * scale;
    let top = bounds.y - translate.y * scale;
    let right = left + bounds.width;
    let bottom = top + bounds.height;
    const centerX = (left + right) / 2,
      centerY = (top + bottom) / 2;
    const edges = movingEdges({ left, top, right, bottom }, dx, dy, index, this.singleSizer, snap);
    ({ left, top, right, bottom } = edges);
    let width = right - left,
      height = bottom - top;
    if (constrained) ({ left, top, width, height } = constrainedBox(bounds, edges, index));
    if (centered) {
      width = 2 * width - bounds.width;
      height = 2 * height - bounds.height;
      left = centerX - width / 2;
      top = centerY - height / 2;
    }
    if (width < 0) left += width;
    if (height < 0) top += height;
    const result = new Rectangle(
      left + translate.x * scale,
      top + translate.y * scale,
      Math.max(1e-12, Math.abs(width)),
      Math.max(1e-12, Math.abs(height))
    );
    if (this.minBounds) {
      result.width = Math.max(
        result.width,
        (this.minBounds.x + this.minBounds.width) * scale + Math.max(0, this.x0 * scale - result.x)
      );
      result.height = Math.max(
        result.height,
        (this.minBounds.y + this.minBounds.height) * scale + Math.max(0, this.y0 * scale - result.y)
      );
    }
    return result;
  };
}

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
function movingEdges(
  edges: Edges,
  dx: number,
  dy: number,
  index: number,
  single: boolean,
  snap: (value: number) => number
) {
  const result = { ...edges };
  if (single) {
    result.right = snap(result.right + dx);
    result.bottom = snap(result.bottom + dy);
    return result;
  }
  if (index > 4) result.bottom = snap(result.bottom + dy);
  else if (index < 3) result.top = snap(result.top + dy);
  if ([0, 3, 5].includes(index)) result.left = snap(result.left + dx);
  else if ([2, 4, 7].includes(index)) result.right = snap(result.right + dx);
  return result;
}

function constrainedBox(bounds: Rectangle, edges: Edges, index: number) {
  let { left, top } = edges;
  let width = edges.right - left,
    height = edges.bottom - top;
  if (bounds.height) {
    const aspect = bounds.width / bounds.height;
    if ([1, 2, 6, 7].includes(index)) width = height * aspect;
    else height = width / aspect;
    if (index === 0) {
      left = edges.right - width;
      top = edges.bottom - height;
    }
  }
  return { left, top, width, height };
}
