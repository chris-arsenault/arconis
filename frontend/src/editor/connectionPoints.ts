import {
  CellState,
  ConnectionConstraint,
  ConstraintHandler,
  ImageBox,
  Point,
  type ConnectionHandler,
  type Graph,
} from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
import type { StyleValue } from "../document/types";

export const ANCHOR_STYLE_KEYS = [
  "exitX",
  "exitY",
  "exitDx",
  "exitDy",
  "exitPerimeter",
  "entryX",
  "entryY",
  "entryDx",
  "entryDy",
  "entryPerimeter",
] as const;

const POINT_IMAGE = new ImageBox("/connection-point.svg", 11, 11);
const POINT_COLOR = "#2f7de1";
const POSITIONS = [0.25, 0.5, 0.75];

// Quarter points stay reachable while a selected shape shows resize handles at its corners and side centers.
const BOX_POINTS = POSITIONS.flatMap((p): [number, number][] => [
  [p, 0],
  [1, p],
  [p, 1],
  [0, p],
]);
const ELLIPSE_POINTS: [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
  [0.146, 0.146],
  [0.854, 0.146],
  [0.854, 0.854],
  [0.146, 0.854],
];
const DIAMOND_POINTS: [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

function pointsFor(shape: unknown) {
  if (shape === "ellipse") return ELLIPSE_POINTS;
  if (shape === "rhombus") return DIAMOND_POINTS;
  return BOX_POINTS;
}

function constraintStyle(constraint: ConnectionConstraint | null, source: boolean) {
  if (!constraint?.point) return {};
  const prefix = source ? "exit" : "entry";
  return {
    [`${prefix}X`]: constraint.point.x,
    [`${prefix}Y`]: constraint.point.y,
    [`${prefix}Perimeter`]: constraint.perimeter,
  } as Record<string, StyleValue>;
}

/**
 * Shows connection points on hovered objects. A drag from a point starts a connector, a drop on a
 * point anchors it there, and a drop on the object's body leaves that end free to follow the outline.
 */
export function configureConnectionPoints(graph: Graph, document: CanvasDocument) {
  ConstraintHandler.prototype.getImageForConstraint = () => POINT_IMAGE;
  graph.getAllConnectionConstraints = (terminal: CellState | null) => {
    if (!terminal?.cell.isVertex()) return null;
    return pointsFor(terminal.style.shape).map(
      ([x, y]) => new ConnectionConstraint(new Point(x, y), true)
    );
  };
  const connection = graph.getPlugin<ConnectionHandler>("ConnectionHandler");
  if (!connection) return;
  connection.constraintHandler.highlightColor = POINT_COLOR;
  connection.marker.validColor = POINT_COLOR;
  // Only a point starts a connector, so dragging anywhere else on an object still moves it.
  connection.isStartEvent = () =>
    connection.constraintHandler.currentFocus !== null &&
    connection.constraintHandler.currentConstraint !== null;
  // The hover highlight would otherwise mark every shape's center as a connector start.
  const markerColor = connection.marker.getMarkerColor.bind(connection.marker);
  connection.marker.getMarkerColor = (event, state, valid) =>
    connection.isConnecting() ? markerColor(event, state, valid) : "none";
  connection.connect = (source, target) => {
    if (!source?.id || !target?.id || source === target) return;
    document.create("connector", 0, 0, {
      source: source.id,
      target: target.id,
      style: {
        ...constraintStyle(connection.sourceConstraint, true),
        ...constraintStyle(connection.constraintHandler.currentConstraint, false),
      },
    });
  };
}
