import type { EditorController } from "./controller";
import { isClosedInk, shapePoints } from "../document/ink";
import { pointInBox, simplifyPath } from "../document/geometry";
import { effectiveAppearance } from "../document/appearance";
import { isBox, type InkKind, type PathPoint } from "../document/types";
import { addInk, eraseWholeInk, eraseInk, type InkSettings } from "./inkCommands";
import { creationOffset, roundForScale } from "./zoom";

/** Pointer previews are local; completed gestures call application commands. */
export function bindDrawingInput(editor: EditorController, signal: AbortSignal) {
  new DrawingGesture(editor, signal).bind();
}

class DrawingGesture {
  private points: PathPoint[] = [];
  private polygon: PathPoint[] = [];
  private preview: SVGSVGElement | null = null;
  private scheduled = false;
  constructor(
    private editor: EditorController,
    private signal: AbortSignal
  ) {}

  bind() {
    const { signal, editor } = this;
    editor.element.addEventListener("pointerdown", this.down, { signal, capture: true });
    editor.element.addEventListener("pointermove", this.move, { signal });
    window.addEventListener("pointerup", this.up, { signal });
    window.addEventListener("keydown", this.key, { signal });
    editor.element.addEventListener("pointercancel", this.cancel, { signal });
    signal.addEventListener("abort", this.cancel, { once: true });
  }
  private point(event: { clientX: number; clientY: number }): PathPoint {
    const point = this.editor.worldPoint(event);
    return [point.x, point.y];
  }
  private cancel = () => {
    this.points = [];
    this.polygon = [];
    this.preview?.remove();
    this.preview = null;
  };
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(this.render);
  }
  private render = () => {
    this.scheduled = false;
    if (this.signal.aborted || !this.points.length) return;
    this.preview ??= createPreview(this.editor);
    const { settings } = this.editor.drawing;
    const shape = gestureShape(settings);
    const path = gesturePath(this.points, shape, this.editor.graph.view.scale);
    const { scale, translate } = this.editor.graph.view;
    const line = this.preview.querySelector("polyline")!;
    line.setAttribute(
      "points",
      path.map(([x, y]) => `${(x + translate.x) * scale},${(y + translate.y) * scale}`).join(" ")
    );
    line.setAttribute("stroke", settings.color);
    line.setAttribute("stroke-width", String(settings.width * creationOffset(scale) * scale));
    line.setAttribute("opacity", settings.mode === "highlighter" ? "0.3" : "1");
    previewArrows(this.preview, line, shape, settings.color);
  };
  private savePolygon() {
    if (this.polygon.length >= 3)
      addInk(
        this.editor.document,
        [...this.polygon, this.polygon[0]],
        this.editor.drawing.settings,
        this.editor.drawing.activeSketch,
        this.editor.graph.view.scale
      );
    this.cancel();
  }
  private down = (event: PointerEvent) => {
    const { editor } = this;
    if (editor.tool !== "draw" || event.button !== 0 || editor.presenter.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.element.focus();
    const point = this.point(event),
      { mode, shape } = editor.drawing.settings;
    if (["highlight", "fill", "eyedropper"].includes(mode)) return this.click(point);
    if (shape === "polygon" && ["pen", "highlighter"].includes(mode))
      return this.polygonPoint(point);
    this.points = [point];
    editor.element.setPointerCapture(event.pointerId);
  };
  private click(point: PathPoint) {
    const target = [...this.editor.document.list()]
      .reverse()
      .find(
        (item) =>
          isBox(item) &&
          !item.markup &&
          item.type !== "highlight" &&
          pointInBox(
            item,
            point,
            effectiveAppearance(item, this.editor.document.namedStyle(item.style))
          )
      );
    this.editor.drawing.click(point, target?.id);
  }
  private polygonPoint(point: PathPoint) {
    if (
      this.polygon.length > 2 &&
      Math.hypot(point[0] - this.polygon[0][0], point[1] - this.polygon[0][1]) <
        12 / this.editor.graph.view.scale
    )
      return this.savePolygon();
    this.polygon.push(point);
    this.points = [...this.polygon];
    this.schedule();
  }
  private move = (event: PointerEvent) => {
    if (!this.points.length || this.polygon.length) return;
    const shape = gestureShape(this.editor.drawing.settings);
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event])
      this.points.push(constrained(this.points[0], this.point(sample), event.shiftKey, shape));
    this.schedule();
  };
  private up = (event: PointerEvent) => {
    if (!this.points.length || this.polygon.length) return;
    const { editor } = this,
      { mode, shape } = editor.drawing.settings;
    if (mode === "lasso") editor.drawing.lasso(this.points, event.shiftKey);
    else if (mode === "eraser")
      eraseWholeInk(
        editor.document,
        editor.drawing.candidates(),
        this.points,
        editor.drawing.radius()
      );
    else if (mode === "precision")
      eraseInk(editor.document, editor.drawing.candidates(), this.points, editor.drawing.radius(2));
    else if (this.points.length > 1)
      addInk(
        editor.document,
        gesturePath(this.points, shape, editor.graph.view.scale),
        editor.drawing.settings,
        editor.drawing.activeSketch,
        editor.graph.view.scale
      );
    this.cancel();
  };
  private key = (event: KeyboardEvent) => {
    if (event.key === "Enter" && this.polygon.length) {
      event.preventDefault();
      this.savePolygon();
    }
    if (event.key === "Escape") this.cancel();
  };
}

function gesturePath(points: PathPoint[], shape: InkKind, scale: number): PathPoint[] {
  const path =
    shape === "freehand" || shape === "polygon"
      ? simplifyPath(points, 0.3 / scale)
      : shapePoints(shape, points[0], points[points.length - 1]);
  return path.map(([x, y]) => [roundForScale(x, scale), roundForScale(y, scale)]);
}

function gestureShape(settings: InkSettings): InkKind {
  return ["pen", "highlighter"].includes(settings.mode) ? settings.shape : "freehand";
}

function constrained(start: PathPoint, end: PathPoint, shift: boolean, shape: InkKind): PathPoint {
  if (!shift || shape === "freehand") return end;
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  if (isClosedInk(shape)) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [start[0] + Math.sign(dx) * side, start[1] + Math.sign(dy) * side];
  }
  const angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
  const length = Math.hypot(dx, dy);
  return [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length];
}

function createPreview(editor: EditorController) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("stroke-preview");
  svg.dataset.marker = `ink-preview-${editor.document.doc.clientID}`;
  const defs = document.createElementNS(ns, "defs");
  const marker = document.createElementNS(ns, "marker");
  marker.id = svg.dataset.marker;
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("orient", "auto-start-reverse");
  const tip = document.createElementNS(ns, "path");
  tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 Z");
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);
  const path = document.createElementNS(ns, "polyline");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  editor.element.append(svg);
  return svg;
}

function previewArrows(
  svg: SVGSVGElement,
  line: SVGPolylineElement,
  shape: InkKind,
  color: string
) {
  svg.querySelector("marker path")?.setAttribute("fill", color);
  const marker = `url(#${svg.dataset.marker})`;
  line.setAttribute("marker-end", shape.includes("arrow") ? marker : "none");
  line.setAttribute("marker-start", shape === "double-arrow" ? marker : "none");
}
