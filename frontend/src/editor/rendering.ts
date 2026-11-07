import { EdgeHandlerConfig, HandleConfig, VertexHandlerConfig, type Graph } from "@maxgraph/core";

const SELECTION_COLOR = "#5443b3";

function escapeLabel(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function configureRendering(graph: Graph) {
  HandleConfig.fillColor = "#f4f2fd";
  HandleConfig.strokeColor = SELECTION_COLOR;
  VertexHandlerConfig.selectionColor = SELECTION_COLOR;
  EdgeHandlerConfig.selectionColor = SELECTION_COLOR;
  // HTML labels are the only maxGraph mode that wraps text. Labels come from peers,
  // so every label is escaped before it reaches the DOM.
  graph.setHtmlLabels(true);
  graph.getLabel = (cell) => escapeLabel(cell?.value);
  // Measuring each shape with getBBox forces layout per cell and dominated zoom time.
  const renderer = graph.cellRenderer;
  const createShape = renderer.createShape.bind(renderer);
  renderer.createShape = (state) => {
    const shape = createShape(state);
    shape.useSvgBoundingBox = false;
    return shape;
  };
  const createLabel = renderer.createLabel.bind(renderer);
  // Labels lay out in screen pixels. maxGraph would lay them out in world units and scale the
  // result, and browsers cannot lay out text in the tiny world units of a deep zoom.
  renderer.getTextScale = () => 1;
  renderer.createLabel = (state, value) => {
    createLabel(state, value);
    const { text } = state;
    if (!text) return;
    text.ignoreStringSize = true;
    const configureCanvas = text.configureCanvas.bind(text);
    text.configureCanvas = (canvas, x, y, width, height) => {
      configureCanvas(canvas, x, y, width, height);
      canvas.setFontSize(text.size * state.view.scale);
    };
  };
}
