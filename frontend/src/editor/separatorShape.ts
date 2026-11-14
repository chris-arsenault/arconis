import { Shape, ShapeRegistry, type AbstractCanvas2D } from "@maxgraph/core";

/** The renderer name of a separator node's shape. */
export const SEPARATOR_SHAPE = "separator";

/**
 * A separator draws one straight line through the middle of its box, along the box's longer side:
 * a wide box is a horizontal rule, a tall one a vertical rule. The box stays the grab area.
 */
class SeparatorShape extends Shape {
  override paintVertexShape(canvas: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    canvas.begin();
    if (h > w) {
      canvas.moveTo(x + w / 2, y);
      canvas.lineTo(x + w / 2, y + h);
    } else {
      canvas.moveTo(x, y + h / 2);
      canvas.lineTo(x + w, y + h / 2);
    }
    canvas.stroke();
  }
}

ShapeRegistry.add(SEPARATOR_SHAPE, SeparatorShape);
