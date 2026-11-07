import type { Graph } from "@maxgraph/core";

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

  constructor(
    private graph: Graph,
    private element: HTMLElement
  ) {
    this.apply();
  }

  toggle() {
    this.visible = !this.visible;
    saveSetting(this.visible);
    this.apply();
  }

  private apply() {
    this.graph.setGridEnabled(this.visible);
    this.element.classList.toggle("grid-off", !this.visible);
  }
}
