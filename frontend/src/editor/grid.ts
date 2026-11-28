import type { Graph } from "@maxgraph/core";
import type { DrawingScales } from "./drawingScales";
import { compatibleUnit, distanceFactor, formatDistance, niceDistance } from "../document/units";
import { syncZoom } from "./zoom";

const GRID_KEY = "arconis:grid";

function readSetting() {
  try {
    return localStorage.getItem(GRID_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSetting(visible: boolean) {
  try {
    localStorage.setItem(GRID_KEY, visible ? "on" : "off");
  } catch {
    // Without storage the setting lasts until this page closes.
  }
}

/** The visible grid and snapping, which turn on and off together. Each person's setting is their own. */
export class CanvasGrid {
  visible = readSetting();
  fixed: { distance: number; unit: string } | null = null;
  private frozen: number | null = null;
  private gestureHolder: string | null = null;

  constructor(
    private graph: Graph,
    private element: HTMLElement,
    private scales: DrawingScales,
    private changed: () => void
  ) {
    this.apply();
  }

  get unit() {
    return this.scales.unitsFor(this.scope.calibration).unit;
  }
  get scope() {
    return this.scales.scope(this.gestureHolder);
  }
  get interval() {
    return this.graph.getGridSize();
  }
  get label() {
    const { factor, unit } = this.scales.unitsFor(this.scope.calibration);
    return formatDistance(this.interval * factor, unit, true);
  }

  setUnit(unit: string) {
    this.scales.setUnit(unit);
    this.sync();
    this.changed();
  }

  setFixed(distance: number | null) {
    this.fixed = distance === null ? null : { distance, unit: this.unit };
    this.sync();
    this.changed();
  }

  freeze(holder: string) {
    if (this.frozen !== null) return;
    this.gestureHolder = holder;
    this.sync();
    this.frozen = this.interval;
  }
  release = () => {
    if (this.frozen === null) return;
    this.frozen = null;
    this.gestureHolder = null;
    this.sync();
    this.changed();
  };

  sync() {
    const { scale } = this.graph.view;
    const { calibration } = this.scope;
    const { factor } = this.scales.unitsFor(calibration);
    const fixed =
      this.fixed && compatibleUnit(calibration, this.fixed.unit) === this.fixed.unit
        ? this.fixed
        : null;
    const fixedFactor = distanceFactor(calibration, fixed?.unit);
    const step =
      this.frozen ??
      (fixed ? fixed.distance / fixedFactor : niceDistance((10 * factor) / scale) / factor);
    const visible = step * Math.max(1, niceDistance(10 / (step * scale)));
    syncZoom(this.graph, this.element, step, visible);
  }

  toggle() {
    this.visible = !this.visible;
    saveSetting(this.visible);
    this.apply();
    this.changed();
  }

  private apply() {
    this.graph.setGridEnabled(this.visible);
    this.element.classList.toggle("grid-off", !this.visible);
  }
}
