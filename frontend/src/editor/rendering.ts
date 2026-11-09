import {
  EdgeHandlerConfig,
  HandleConfig,
  VertexHandlerConfig,
  UrlConverter,
  Shape,
  ImageShape,
  RectangleShape,
  EllipseShape,
  CellState,
  type Cell,
  type Graph,
  type TooltipHandler,
} from "@maxgraph/core";
import { labelIsLegible } from "./culling";
import type { Marks } from "./marks";
import { escapeText, renderMarkdown } from "../text/markdown";

// maxGraph treats anything but http and data addresses as relative, which would prefix a picture's
// object URL with the site's address and leave it unable to load.
const isRelativeUrl = UrlConverter.prototype.isRelativeUrl.bind(UrlConverter.prototype);
UrlConverter.prototype.isRelativeUrl = (url: string) =>
  !url.startsWith("blob:") && isRelativeUrl(url);

const SELECTION_COLOR = "#5443b3";
/** The smallest a frame's or slide's title is drawn on screen, whatever the zoom. */
const TITLE_FLOOR_PIXELS = 11;

// Handles and connection-point icons have known bounds too. They are created outside the cell
// renderer, and measuring each one through SVG would flush layout after every label update.
function geometricBoundingBox(this: Shape) {
  this.useSvgBoundingBox = false;
  Shape.prototype.updateBoundingBox.call(this);
}
ImageShape.prototype.updateBoundingBox = geometricBoundingBox;
RectangleShape.prototype.updateBoundingBox = geometricBoundingBox;
EllipseShape.prototype.updateBoundingBox = geometricBoundingBox;

const escapeLabel = (value: unknown) => escapeText(String(value ?? ""));

/** Keys `objectStyle` sets for the label alone: a subtitle, a badge's image and the properties. */
export const LABEL_SUBTITLE = "labelSubtitle";
export const LABEL_BADGE = "labelBadge";
export const LABEL_PROPERTIES = "labelProperties";

/** The item's properties as the style carries them, or none. */
export function propertiesOf(style: Record<string, unknown>): Record<string, string> {
  const raw = style[LABEL_PROPERTIES];
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

/** `{owner}` in a label reads as the owner property's value; unknown names stay as written. */
function fillPlaceholders(html: string, properties: Record<string, string>) {
  if (!Object.keys(properties).length) return html;
  return html.replaceAll(/\{([A-Za-z_][A-Za-z0-9_-]*)\}/g, (match, key: string) =>
    key in properties ? escapeLabel(properties[key]) : match
  );
}

/**
 * A label's markup: the name, bold over a subtitle when there is one, after a badge when there is
 * one, between its marks. Names, subtitles and a slide's deck come from peers and are escaped; a
 * badge is only ever a local icon's data address, which `objectStyle` resolves from the icon sets.
 */
function composeLabel(cell: Cell, marks: Marks, content: string) {
  const style = cell.getStyle() as Record<string, unknown>;
  const subtitle = typeof style[LABEL_SUBTITLE] === "string" ? style[LABEL_SUBTITLE] : "";
  const badge = typeof style[LABEL_BADGE] === "string" ? style[LABEL_BADGE] : "";
  let name = fillPlaceholders(content, propertiesOf(style));
  if (subtitle)
    name = `<div style="font-weight:bold">${name}</div><span style="font-weight:normal;font-size:0.85em;opacity:0.85">${escapeLabel(subtitle)}</span>`;
  if (badge.startsWith("data:image/"))
    name = `<img src="${badge.replaceAll('"', "%22")}" alt="" style="width:1.3em;height:1.3em;vertical-align:middle;margin-right:0.4em">${name}`;
  // The folded and comment counts are controls: one expands the item, the other opens its threads.
  const after = escapeLabel(marks.after)
    .replace(
      /▸\d+/,
      (count) => `<span data-mark="collapsed" style="cursor:pointer">${count}</span>`
    )
    .replace(
      /💬\d+/,
      (count) => `<span data-mark="comments" style="cursor:pointer">${count}</span>`
    );
  const body = [escapeLabel(marks.before), name, after].filter(Boolean).join(" ");
  if (!body) return "";
  const css = labelVariables(style);
  // A title is as wide as its item and ends in an ellipsis rather than running past it.
  const classes = style.keepTitle === true ? "canvas-markdown canvas-title" : "canvas-markdown";
  return `<div class="${classes}" dir="auto" style="${css}">${body}</div>`;
}

function labelVariables(style: Record<string, unknown>) {
  const lineHeight = Number(style.labelLineHeight ?? 1.35);
  const paragraphGap = Number(style.labelParagraphGap ?? 0.5);
  const highlight = String(style.labelHighlight ?? "none");
  const parts = [];
  if (style.whiteSpace === "nowrap") parts.push("white-space:nowrap;overflow-wrap:normal");
  if (Number.isFinite(lineHeight) && lineHeight > 0) parts.push(`--text-line-height:${lineHeight}`);
  if (Number.isFinite(paragraphGap) && paragraphGap >= 0)
    parts.push(`--text-paragraph-gap:${paragraphGap}em`);
  if (/^#[\da-f]{3,8}$/i.test(highlight)) parts.push(`background-color:${highlight}`);
  return parts.join(";");
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
  // Hovering an object shows its properties, one per line, as plain text.
  graph.setTooltips(true);
  const tooltips = graph.getPlugin<TooltipHandler>("TooltipHandler");
  if (tooltips)
    tooltips.getTooltipForCell = (cell) => {
      const properties = propertiesOf(cell.getStyle() as Record<string, unknown>);
      return Object.entries(properties)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    };
  // The cache follows live cells, and zoom never reparses unchanged Markdown.
  const labels = new WeakMap<Cell, { source: string; html: string }>();
  graph.getLabel = (cell) => {
    if (!cell || cell.getStyle().noLabel) return "";
    const keepTitle = (cell.getStyle() as Record<string, unknown>).keepTitle === true;
    if (!keepTitle && !labelIsLegible(cell, graph.view.scale)) return "";
    const source = String(cell.value ?? "");
    let label = labels.get(cell);
    if (!label || label.source !== source) {
      label = { source, html: renderMarkdown(source) };
      labels.set(cell, label);
    }
    return composeLabel(cell, marks(cell), label.html);
  };
  // Measuring each shape with getBBox forces layout per cell and dominated zoom time.
  const renderer = graph.cellRenderer;
  // Titles are laid out at their item's width, and keep their padding and position while they are.
  renderer.legacySpacing = false;
  const isTextShapeInvalid = renderer.isTextShapeInvalid.bind(renderer);
  // TextShape resets empty colors to "none", while the stylesheet removes those entries.
  // Supply the same defaults to its unchanged-style check so it can reuse the label's DOM.
  renderer.isTextShapeInvalid = (state, text) =>
    isTextShapeInvalid(
      new CellState(state.view, state.cell, {
        ...state.style,
        labelBackgroundColor: state.style.labelBackgroundColor ?? "none",
        labelBorderColor: state.style.labelBorderColor ?? "none",
      }),
      text
    );
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
    // Markdown already decides line breaks, including literal newlines inside code blocks.
    text.replaceLinefeeds = false;
    text.ignoreStringSize = true;
    const configureCanvas = text.configureCanvas.bind(text);
    // A title that keeps its place at any zoom never shrinks below a readable size on screen.
    const keepTitle = (state.style as Record<string, unknown>).keepTitle === true;
    const floor = keepTitle ? TITLE_FLOOR_PIXELS : 0;
    text.configureCanvas = (canvas, x, y, width, height) => {
      configureCanvas(canvas, x, y, width, height);
      canvas.setFontSize(Math.max(floor, text.size * state.view.scale));
    };
  };
}
