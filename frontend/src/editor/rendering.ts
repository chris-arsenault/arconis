import {
  EdgeHandlerConfig,
  HandleConfig,
  VertexHandlerConfig,
  UrlConverter,
  type Cell,
  type Graph,
} from "@maxgraph/core";
import { labelIsLegible } from "./culling";
import type { Marks } from "./marks";

// maxGraph treats anything but http and data addresses as relative, which would prefix a picture's
// object URL with the site's address and leave it unable to load.
const isRelativeUrl = UrlConverter.prototype.isRelativeUrl.bind(UrlConverter.prototype);
UrlConverter.prototype.isRelativeUrl = (url: string) =>
  !url.startsWith("blob:") && isRelativeUrl(url);

const SELECTION_COLOR = "#5443b3";

function escapeLabel(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Keys `objectStyle` sets for the label alone: a subtitle and a badge's image. */
export const LABEL_SUBTITLE = "labelSubtitle";
export const LABEL_BADGE = "labelBadge";

/**
 * A label's markup: the name, bold over a subtitle when there is one, after a badge when there is
 * one, between its marks. Names, subtitles and a slide's deck come from peers and are escaped; a
 * badge is only ever a local icon's data address, which `objectStyle` resolves from the icon sets.
 */
function composeLabel(cell: Cell, marks: Marks) {
  const style = cell.getStyle() as Record<string, unknown>;
  const subtitle = typeof style[LABEL_SUBTITLE] === "string" ? style[LABEL_SUBTITLE] : "";
  const badge = typeof style[LABEL_BADGE] === "string" ? style[LABEL_BADGE] : "";
  let name = escapeLabel(cell.value);
  if (subtitle)
    name = `<b>${name}</b><br><span style="font-weight:normal;font-size:0.85em;opacity:0.85">${escapeLabel(subtitle)}</span>`;
  if (badge.startsWith("data:image/"))
    name = `<img src="${badge.replaceAll('"', "%22")}" alt="" style="width:1.3em;height:1.3em;vertical-align:middle;margin-right:0.4em">${name}`;
  return [escapeLabel(marks.before), name, marks.after].filter(Boolean).join(" ");
}

/** `marks` surrounds a label with signs, such as that an object holds more than is drawn. */
export function configureRendering(graph: Graph, marks: (cell: Cell) => Marks) {
  HandleConfig.fillColor = "#f4f2fd";
  HandleConfig.strokeColor = SELECTION_COLOR;
  VertexHandlerConfig.selectionColor = SELECTION_COLOR;
  EdgeHandlerConfig.selectionColor = SELECTION_COLOR;
  // HTML labels are the only maxGraph mode that wraps text. Labels come from peers,
  // so every label is escaped before it reaches the DOM.
  graph.setHtmlLabels(true);
  graph.getLabel = (cell) => {
    if (!cell || cell.getStyle().noLabel || !labelIsLegible(cell, graph.view.scale)) return "";
    return composeLabel(cell, marks(cell));
  };
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
