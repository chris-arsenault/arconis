import type { Graph } from "@maxgraph/core";
import type { View } from "../document/types";
import { viewportSize } from "./zoom";

/** How many places back a person can return to. */
const HISTORY_LIMIT = 50;

/**
 * Where the view was before each jump, so fitting, zooming into something, following a link or
 * finding a match is safe to do: Back returns, Forward goes again. Only jumps are recorded;
 * scrolling and dragging the view are not.
 */
export class ViewHistory {
  private back: View[] = [];
  private forward: View[] = [];
  private travelling = false;

  constructor(
    private graph: Graph,
    private element: Pick<HTMLElement, "clientWidth" | "clientHeight">
  ) {}

  /** The view as it is now. */
  current(): View {
    const { scale, translate } = this.graph.view;
    const { width, height } = viewportSize(this.element);
    return {
      zoom: scale,
      center: {
        x: width / 2 / scale - translate.x,
        y: height / 2 / scale - translate.y,
      },
    };
  }

  /** Remembers the view before a jump away from it. */
  record() {
    if (this.travelling) return;
    this.back.push(this.current());
    if (this.back.length > HISTORY_LIMIT) this.back.shift();
    this.forward = [];
  }

  canGoBack() {
    return this.back.length > 0;
  }
  canGoForward() {
    return this.forward.length > 0;
  }

  /** The previous view, moving the current one to the forward list; null when there is none. */
  goBack(): View | null {
    const view = this.back.pop();
    if (!view) return null;
    this.forward.push(this.current());
    return view;
  }

  goForward(): View | null {
    const view = this.forward.pop();
    if (!view) return null;
    this.back.push(this.current());
    return view;
  }

  /** Runs a flight that must not record itself as a jump. */
  travel(work: () => void) {
    this.travelling = true;
    try {
      work();
    } finally {
      this.travelling = false;
    }
  }
}

const histories = new WeakMap<Graph, ViewHistory>();

export function viewHistoryOf(graph: Graph) {
  return histories.get(graph) ?? null;
}

export function trackViewHistory(graph: Graph, element: HTMLElement) {
  const history = new ViewHistory(graph, element);
  histories.set(graph, history);
  return history;
}
