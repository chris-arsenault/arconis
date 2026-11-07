import type { Graph } from "@maxgraph/core";

function escapeLabel(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function configureRendering(graph: Graph) {
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
  renderer.createLabel = (state, value) => {
    createLabel(state, value);
    if (state.text) state.text.ignoreStringSize = true;
  };
}
