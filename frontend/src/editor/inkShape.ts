import { ConnectorShape, ShapeRegistry, type AbstractCanvas2D, type Point } from "@maxgraph/core";

/** A closed editable path uses the same renderer as ink, with a filled interior. */
class InkShape extends ConnectorShape {
  override paintEdgeShape(canvas: AbstractCanvas2D, points: Point[]) {
    const closed = (this.style as Record<string, unknown> | undefined)?.inkClosed;
    if (!closed) return super.paintEdgeShape(canvas, points);
    if (!points.length) return;
    canvas.begin();
    canvas.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) canvas.lineTo(point.x, point.y);
    canvas.close();
    canvas.fillAndStroke();
  }
}

ShapeRegistry.add("ink", InkShape);
