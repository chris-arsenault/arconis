import {
  Cell,
  Geometry,
  VertexHandler,
  type CellStyle,
  type ConnectionHandler,
  type Graph,
} from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import { isBox } from "../document/types";

/**
 * A connector dragged into empty space ends on a new object like its source, so a chain grows
 * without reaching for the rail. Alt while resizing scales from the centre.
 */
export function configureCreateTarget(graph: Graph, document: CanvasDocument) {
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
      style as CellStyle
    );
    vertex.setVertex(true);
    vertex.setConnectable(true);
    return vertex;
  };
}

/** Alt during a resize keeps the centre where it is, growing both ways. */
export function configureCentredResize() {
  VertexHandler.prototype.isCenteredEvent = (_state, me) => Boolean(me.getEvent().altKey);
}
