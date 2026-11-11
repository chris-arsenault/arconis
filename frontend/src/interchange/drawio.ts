import {
  arrowOf,
  canvasColor,
  type Box,
  type Diagram,
  type DiagramShape,
  type EdgePath,
  type Paint,
} from "./diagram";
import { findElement, parseXml, plainText, type XmlElement } from "./xml";

/**
 * A draw.io file read into the shared diagram model. Its boxes keep the positions and sizes the
 * file gives them, a box holding others becomes a container, and every page is placed in a row.
 */

/** Room left between one page's content and the next page's. */
const PAGE_GAP = 200;

type Point = [number, number];
type Style = Record<string, string>;

interface Cell {
  id: string;
  value: string;
  style: Style;
  vertex: boolean;
  edge: boolean;
  parent: string;
  source: string;
  target: string;
  box: Box;
  /** The points a line passes through, and its loose ends where it joins nothing. */
  points: Point[];
  sourcePoint: Point | null;
  targetPoint: Point | null;
}

const OPENINGS = ["<mxfile", "<mxGraphModel"];

/** Whether the text is a draw.io file or a bare graph model. */
export function isDrawio(text: string) {
  const start = text.indexOf("<mx");
  if (start < 0 || !OPENINGS.some((opening) => text.startsWith(opening, start))) return false;
  // Only a declaration or a comment may come before the root element.
  const before = text.slice(0, start).trim();
  return (
    !before || ((before.startsWith("<?") || before.startsWith("<!--")) && !before.includes("</"))
  );
}

/** A draw.io style, `name=value;flag;`, as a lookup; a flag is present with an empty value. */
function styleOf(source: string) {
  const style: Style = {};
  for (const part of source.split(";")) {
    const at = part.indexOf("=");
    const name = (at < 0 ? part : part.slice(0, at)).trim();
    if (name) style[name] = at < 0 ? "" : part.slice(at + 1).trim();
  }
  return style;
}

const numberOf = (value: string | undefined) => Number(value) || 0;
const attribute = (element: XmlElement, name: string) => element.attributes[name] ?? "";

function pointOf(element: XmlElement): Point {
  return [numberOf(element.attributes.x), numberOf(element.attributes.y)];
}

const NO_GEOMETRY: XmlElement = { name: "mxGeometry", attributes: {}, children: [], text: "" };

function geometryOf(element: XmlElement) {
  const geometry = element.children.find((child) => child.name === "mxGeometry") ?? NO_GEOMETRY;
  const named = (as: string) => {
    const point = geometry.children.find(
      (child) => child.name === "mxPoint" && child.attributes.as === as
    );
    return point ? pointOf(point) : null;
  };
  const waypoints = geometry.children.find((child) => child.name === "Array");
  return {
    box: {
      x: numberOf(geometry.attributes.x),
      y: numberOf(geometry.attributes.y),
      width: numberOf(geometry.attributes.width),
      height: numberOf(geometry.attributes.height),
    },
    points: (waypoints?.children ?? []).map(pointOf),
    sourcePoint: named("sourcePoint"),
    targetPoint: named("targetPoint"),
  };
}

/** A cell, with the id and label of the object element that wraps it when one does. */
function cellOf(element: XmlElement, wrapper: XmlElement | null): Cell {
  const labelled = wrapper ?? element;
  return {
    id: attribute(labelled, "id"),
    value: plainText(attribute(labelled, wrapper ? "label" : "value")),
    style: styleOf(attribute(element, "style")),
    vertex: attribute(element, "vertex") === "1",
    edge: attribute(element, "edge") === "1",
    parent: attribute(element, "parent"),
    source: attribute(element, "source"),
    target: attribute(element, "target"),
    ...geometryOf(element),
  };
}

function cellsOf(model: XmlElement) {
  const cells: Cell[] = [];
  for (const child of findElement(model, "root")?.children ?? []) {
    const inner = child.children.find((candidate) => candidate.name === "mxCell");
    if (child.name === "mxCell") cells.push(cellOf(child, null));
    else if (inner) cells.push(cellOf(inner, child));
  }
  return cells;
}

/** A compressed page: base64 of raw-deflated, URI-encoded XML. */
async function inflate(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decodeURIComponent(await new Response(stream).text());
}

async function modelsOf(text: string) {
  const root = parseXml(text);
  if (root.name === "mxGraphModel") return [root];
  const models: XmlElement[] = [];
  for (const page of root.children.filter((child) => child.name === "diagram")) {
    const model = findElement(page, "mxGraphModel");
    if (model) models.push(model);
    else if (page.text.trim()) models.push(parseXml(await inflate(page.text.trim())));
  }
  return models;
}

/** Style flags, then words within a shape's name, that say what a box is. */
const FLAG_SHAPES: [string, DiagramShape][] = [
  ["ellipse", "ellipse"],
  ["rhombus", "decision"],
  ["cloud", "cloud"],
  ["text", "text"],
];
const NAMED_SHAPES: [string, DiagramShape][] = [
  ["ellipse", "ellipse"],
  ["rhombus", "decision"],
  ["cylinder", "database"],
  ["datastore", "database"],
  ["database", "database"],
  ["cloud", "cloud"],
  ["actor", "person"],
  ["person", "person"],
  ["note", "note"],
];

function shapeOf(style: Style): DiagramShape {
  const name = (style.shape ?? "").toLowerCase();
  const named = NAMED_SHAPES.find(([word]) => name.includes(word));
  if (named) return named[1];
  return FLAG_SHAPES.find(([flag]) => flag in style)?.[1] ?? "rectangle";
}

const colorOf = (value: string | undefined) =>
  value === "none" ? "none" : canvasColor(value ?? "");

function paintOf(style: Style): Paint {
  return {
    fill: colorOf(style.fillColor),
    line: colorOf(style.strokeColor),
    textColor: canvasColor(style.fontColor ?? ""),
    dashed: style.dashed === "1",
  };
}

const CORNERED = ["orthogonal", "elbow", "entityrelation", "segment"];

function pathOf(style: Style): EdgePath {
  if (style.curved === "1") return "curved";
  const routing = (style.edgeStyle ?? "").toLowerCase();
  return CORNERED.some((word) => routing.includes(word)) ? "cornered" : "diagonal";
}

const isContainer = (style: Style) => "swimlane" in style || style.container === "1";

/** One page's cells, added to a diagram shifted right by the pages before it. */
class Page {
  private byId: Map<string, Cell>;
  /** The right edge of everything this page added. */
  right: number;

  constructor(
    private diagram: Diagram,
    private cells: Cell[],
    private prefix: string,
    private offset: number
  ) {
    this.byId = new Map(cells.map((cell) => [cell.id, cell]));
    this.right = offset;
  }

  private holder(cell: Cell) {
    const holder = this.byId.get(cell.parent);
    return holder?.vertex ? holder : null;
  }

  /** A label is a box whose parent is a line. */
  private isLabel(cell: Cell) {
    return cell.vertex && this.byId.get(cell.parent)?.edge === true;
  }

  /** A box's place on the canvas: the file gives it relative to the box that holds it. */
  private absolute(cell: Cell): Box {
    const holder = this.holder(cell);
    if (!holder) return { ...cell.box, x: cell.box.x + this.offset };
    const outer = this.absolute(holder);
    return { ...cell.box, x: outer.x + cell.box.x, y: outer.y + cell.box.y };
  }

  private name(id: string) {
    return this.prefix + id;
  }

  private addBoxes() {
    const boxes = this.cells.filter((cell) => cell.vertex && !this.isLabel(cell));
    const holders = new Set(boxes.map((cell) => this.holder(cell)?.id));
    for (const cell of boxes) {
      const box = this.absolute(cell);
      this.right = Math.max(this.right, box.x + box.width);
      const holder = this.holder(cell);
      const common = {
        ...paintOf(cell.style),
        id: this.name(cell.id),
        label: cell.value,
        parent: holder ? this.name(holder.id) : "",
        box,
      };
      if (holders.has(cell.id) || isContainer(cell.style)) this.diagram.groups.push(common);
      else {
        const rotate = numberOf(cell.style.rotation);
        this.diagram.nodes.push({ ...common, shape: shapeOf(cell.style), rotate });
      }
    }
  }

  private labelOf(cell: Cell) {
    if (cell.value) return cell.value;
    return this.cells.find((other) => this.isLabel(other) && other.parent === cell.id)?.value ?? "";
  }

  /** Where a line's end is: the middle of the box it joins, or the loose point the file gives. */
  private end(id: string, loose: Point | null): Point | null {
    const joined = this.byId.get(id);
    if (joined?.vertex) {
      const box = this.absolute(joined);
      return [box.x + box.width / 2, box.y + box.height / 2];
    }
    return loose ? [loose[0] + this.offset, loose[1]] : null;
  }

  /** A line that joins fewer than two boxes, kept as a path through its points. */
  private addStroke(cell: Cell, arrow: boolean) {
    const first = this.end(cell.source, cell.sourcePoint);
    const last = this.end(cell.target, cell.targetPoint);
    if (!first || !last) return;
    const between = cell.points.map(([x, y]): Point => [x + this.offset, y]);
    const points = [first, ...between, last];
    this.diagram.strokes.push({
      points,
      arrow,
      line: canvasColor(cell.style.strokeColor ?? ""),
      dashed: cell.style.dashed === "1",
    });
    this.right = Math.max(this.right, ...points.map(([x]) => x));
  }

  private addEdges() {
    for (const cell of this.cells.filter((candidate) => candidate.edge)) {
      const end = (cell.style.endArrow ?? "classic") !== "none";
      const start = (cell.style.startArrow ?? "none") !== "none";
      const joined = [cell.source, cell.target].every((id) => this.byId.get(id)?.vertex);
      if (!joined) {
        this.addStroke(cell, end);
        continue;
      }
      this.diagram.edges.push({
        from: this.name(cell.source),
        to: this.name(cell.target),
        label: this.labelOf(cell),
        arrow: arrowOf(start, end),
        dashed: cell.style.dashed === "1",
        path: pathOf(cell.style),
      });
    }
  }

  add() {
    this.addBoxes();
    this.addEdges();
    return this.right;
  }
}

/** Reads a draw.io file. Throws when it has no pages or nothing on them. */
export async function parseDrawio(text: string): Promise<Diagram> {
  const models = await modelsOf(text);
  const diagram: Diagram = { direction: "right", nodes: [], groups: [], edges: [], strokes: [] };
  let offset = 0;
  models.forEach((model, index) => {
    const prefix = models.length > 1 ? `p${index + 1}_` : "";
    const right = new Page(diagram, cellsOf(model), prefix, offset).add();
    if (right > offset) offset = right + PAGE_GAP;
  });
  if (!diagram.nodes.length && !diagram.groups.length && !diagram.strokes.length)
    throw new Error("This draw.io file has nothing in it to place.");
  return diagram;
}
