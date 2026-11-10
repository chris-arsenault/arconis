import type { EditorController } from "./controller";
import { isInputTarget } from "./ui";
import { viewportSize } from "./zoom";
import type { CellState, Graph } from "@maxgraph/core";

export interface MeasurePoint {
  x: number;
  y: number;
}
export interface Measurement {
  start: MeasurePoint;
  end: MeasurePoint;
  complete: boolean;
}

/** Temporary world-space endpoints never enter Yjs or the undo history. */
export class CanvasMeasurement {
  value: Measurement | null = null;
  private cursor: MeasurePoint | null = null;
  private down: MeasurePoint | null = null;
  constructor(private editor: EditorController) {}

  clear() {
    this.value = null;
    this.editor.emit();
  }

  private snapped(point: MeasurePoint, event: { altKey: boolean; shiftKey: boolean }) {
    if (event.altKey) return point;
    const { graph } = this.editor;
    let next = graph.isGridEnabled() ? { x: graph.snap(point.x), y: graph.snap(point.y) } : point;
    next = nearestGeometry(graph, point) ?? next;
    if (event.shiftKey && this.value && !this.value.complete) {
      const { start } = this.value;
      next =
        Math.abs(next.x - start.x) > Math.abs(next.y - start.y)
          ? { x: next.x, y: start.y }
          : { x: start.x, y: next.y };
    }
    return next;
  }

  private place(point: MeasurePoint) {
    if (!this.value || this.value.complete)
      this.value = { start: point, end: point, complete: false };
    else this.value = { ...this.value, end: point, complete: true };
    this.editor.emit();
  }

  bind(signal: AbortSignal) {
    const { editor } = this;
    const options = { signal, capture: true };
    editor.element.addEventListener(
      "pointerdown",
      (event) => {
        if (editor.tool !== "measure" || event.button !== 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.element.focus({ preventScroll: true });
        this.down = editor.worldPoint(event);
        this.place(this.snapped(this.down, event));
      },
      options
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        if (editor.tool !== "measure") return;
        if (!this.down && !(event.target instanceof Node && editor.element.contains(event.target)))
          return;
        this.cursor = this.snapped(editor.worldPoint(event), event);
        if (this.value && !this.value.complete) {
          this.value = { ...this.value, end: this.cursor };
          editor.emit();
        }
      },
      options
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (editor.tool !== "measure" || !this.down) return;
        if (
          this.value &&
          !this.value.complete &&
          Math.hypot(
            editor.worldPoint(event).x - this.down.x,
            editor.worldPoint(event).y - this.down.y
          ) *
            editor.graph.view.scale >
            3
        )
          this.value = {
            ...this.value,
            end: this.snapped(editor.worldPoint(event), event),
            complete: true,
          };
        this.down = null;
        editor.emit();
      },
      options
    );
    window.addEventListener(
      "pointercancel",
      () => {
        this.down = null;
      },
      options
    );
    window.addEventListener("keydown", (event) => this.key(event), options);
  }

  private key(event: KeyboardEvent) {
    const { editor } = this;
    if (
      editor.tool !== "measure" ||
      isMeasurementControl(event.target) ||
      !["Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      this.escape();
      return;
    }
    const { scale, translate } = editor.graph.view;
    const size = viewportSize(editor.element);
    const current = this.cursor ?? {
      x: size.width / 2 / scale - translate.x,
      y: size.height / 2 / scale - translate.y,
    };
    if (event.key === "Enter") {
      this.place(this.snapped(current, event));
      return;
    }
    const step = (event.shiftKey ? 100 : 10) / scale;
    const delta = KEY_DELTAS[event.key];
    this.cursor = { x: current.x + delta.x * step, y: current.y + delta.y * step };
    if (this.value && !this.value.complete) {
      this.value = { ...this.value, end: this.cursor };
      editor.emit();
    }
  }

  private escape() {
    if (this.value) this.clear();
    else this.editor.setTool("select");
  }
}

function isMeasurementControl(target: EventTarget | null) {
  if (isInputTarget(target)) return true;
  return target instanceof Element && Boolean(target.closest("button, a"));
}

const KEY_DELTAS: Record<string, MeasurePoint> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function statePoints(state: CellState) {
  if (!state.cell.isVertex()) return state.absolutePoints.filter((point) => point !== null);
  const angle = (Number(state.style.rotation ?? 0) * Math.PI) / 180;
  const cx = state.getCenterX(),
    cy = state.getCenterY();
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
    [0, 0],
  ].map(([x, y]) => ({
    x: cx + x * state.width * Math.cos(angle) - y * state.height * Math.sin(angle),
    y: cy + x * state.width * Math.sin(angle) + y * state.height * Math.cos(angle),
  }));
}

function nearestGeometry(graph: Graph, point: MeasurePoint) {
  let best = 8 / graph.view.scale;
  let result: MeasurePoint | null = null;
  for (const state of graph.view.states.values()) {
    if (state.shape?.node?.style.display === "none") continue;
    for (const candidate of statePoints(state)) {
      const world = {
        x: candidate.x / graph.view.scale - graph.view.translate.x,
        y: candidate.y / graph.view.scale - graph.view.translate.y,
      };
      const distance = Math.hypot(world.x - point.x, world.y - point.y);
      if (distance < best) {
        best = distance;
        result = world;
      }
    }
  }
  return result;
}
