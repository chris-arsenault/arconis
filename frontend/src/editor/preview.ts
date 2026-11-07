import type { Graph, SelectionCellsHandler, SelectionHandler, VertexHandler } from "@maxgraph/core";

export interface PreviewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** World-space boxes of a native move or resize that has not landed in the document yet. */
export function previewBoxes(graph: Graph): PreviewBox[] {
  const { scale, translate } = graph.view;
  const world = (x: number, y: number, width: number, height: number): PreviewBox => ({
    x: x / scale - translate.x,
    y: y / scale - translate.y,
    width: width / scale,
    height: height / scale,
  });
  const mover = graph.getPlugin<SelectionHandler>("SelectionHandler");
  if (mover?.first && mover.cells && (mover.currentDx || mover.currentDy))
    return mover.cells.flatMap((cell) => {
      const state = graph.view.getState(cell);
      return state
        ? [world(state.x + mover.currentDx, state.y + mover.currentDy, state.width, state.height)]
        : [];
    });
  const handlers = graph.getPlugin<SelectionCellsHandler>("SelectionCellsHandler");
  return graph.getSelectionCells().flatMap((cell) => {
    const handler = handlers?.getHandler(cell) as VertexHandler | undefined;
    if (handler?.index === null || handler?.index === undefined || !handler.bounds) return [];
    const { x, y, width, height } = handler.bounds;
    return [world(x, y, width, height)];
  });
}
