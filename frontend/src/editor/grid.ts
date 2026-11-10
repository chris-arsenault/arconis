import type { Graph } from "@maxgraph/core";
import type { CanvasDocument } from "../document/canvasDocument";
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
  preferredUnit = "";
  fixed: { distance: number; unit: string } | null = null;
  private frozen: number | null = null;

  constructor(
    private graph: Graph,
    private element: HTMLElement,
    private document: CanvasDocument,
    private changed: () => void
  ) {
    try {
      this.preferredUnit = localStorage.getItem("arconis:unit") ?? "";
    } catch {
      /* Session preference still works. */
    }
    this.apply();
  }

  get unit() {
    return compatibleUnit(this.document.calibration(), this.preferredUnit);
  }
  get factor() {
    return distanceFactor(this.document.calibration(), this.unit);
  }
  get interval() {
    return this.graph.getGridSize();
  }
  get label() {
    return formatDistance(this.interval * this.factor, this.unit, true);
  }

  setUnit(unit: string) {
    this.preferredUnit = unit;
    try {
      localStorage.setItem("arconis:unit", unit);
    } catch {
      /* Session preference still works. */
    }
    this.sync();
    this.changed();
  }

  setFixed(distance: number | null) {
    this.fixed = distance === null ? null : { distance, unit: this.unit };
    this.sync();
    this.changed();
  }

  freeze() {
    this.frozen = this.interval;
  }
  release = () => {
    this.frozen = null;
    this.sync();
  };

  sync() {
    const { scale } = this.graph.view;
    if (
      this.fixed &&
      compatibleUnit(this.document.calibration(), this.fixed.unit) !== this.fixed.unit
    )
      this.fixed = null;
    const fixedFactor = distanceFactor(this.document.calibration(), this.fixed?.unit);
    const step =
      this.frozen ??
      (this.fixed
        ? this.fixed.distance / fixedFactor
        : niceDistance((10 * this.factor) / scale) / this.factor);
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
