import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CellState, Rectangle } from "@maxgraph/core";
import type { EditorController } from "../editor/controller";

interface Viewport {
  width: number;
  height: number;
}

/**
 * Places every badge in one pass after a render. Measuring a badge forces the browser to lay out
 * the whole canvas, so all writes come first, then all measurements, then all positions: one
 * layout per frame however many objects carry badges.
 */
export class MetadataPlacement {
  private entries: { node: HTMLDivElement; bounds: Rectangle }[] = [];

  add(node: HTMLDivElement, bounds: Rectangle) {
    this.entries.push({ node, bounds });
  }

  flush({ width, height }: Viewport) {
    const entries = this.entries.splice(0);
    for (const { node, bounds } of entries)
      node.style.maxWidth = `${Math.min(width - 16, Math.max(96, Math.min(220, bounds.width)))}px`;
    const boxes = entries.map(({ node }) => node.getBoundingClientRect());
    entries.forEach(({ node, bounds }, index) => {
      const box = boxes[index];
      const below = bounds.y + bounds.height + 2;
      const top = below + box.height <= height - 8 ? below : bounds.y - box.height - 2;
      const left = bounds.x + (bounds.width - box.width) / 2;
      node.style.left = `${Math.max(8, Math.min(left, width - box.width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(top, height - box.height - 8))}px`;
    });
  }
}

/** Interleave chrome with the object's SVG paint order; selection raises it above the canvas. */
export function ObjectMetadataLayer({
  editor,
  id,
  selected,
  dimmed,
  label,
  bounds,
  viewportWidth,
  viewportHeight,
  placement,
  children,
}: Readonly<{
  editor: EditorController;
  id: string;
  selected: boolean;
  dimmed: boolean;
  label: string;
  bounds: Rectangle;
  viewportWidth: number;
  viewportHeight: number;
  placement: MetadataPlacement;
  children: ReactNode;
}>) {
  const [host] = useState(() =>
    document.createElementNS("http://www.w3.org/2000/svg", "foreignObject")
  );
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Only writes here; the placement measures every badge together once all have rendered.
    setAttribute(host, "data-canvas-chrome", id);
    setAttribute(host, "width", String(viewportWidth));
    setAttribute(host, "height", String(viewportHeight));
    setAttribute(host, "pointer-events", "none");
    insertMetadata(editor, id, host, selected);
    if (ref.current) placement.add(ref.current, bounds);
  });
  useLayoutEffect(() => {
    const stop = (event: Event) => event.stopPropagation();
    const events = ["pointerdown", "mousedown", "dblclick"];
    events.forEach((event) => host.addEventListener(event, stop));
    return () => {
      events.forEach((event) => host.removeEventListener(event, stop));
      host.remove();
    };
  }, [host]);
  return createPortal(
    <div
      ref={ref}
      className={`object-metadata${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
      data-testid="object-metadata"
      data-object-id={id}
      aria-label={label}
    >
      {children}
    </div>,
    host
  );
}

function insertMetadata(
  editor: EditorController,
  id: string,
  host: SVGForeignObjectElement,
  selected: boolean
) {
  const view = editor.graph.view;
  const cell = editor.graph.getDataModel().getCell(id);
  const state = cell ? view.getState(cell) : null;
  const pane = selected ? view.getOverlayPane() : view.getDrawPane();
  if (!state || !pane) return;
  // Moving a node that is already in place still discards its layout, so move only when needed.
  if (selected) {
    if (host.parentNode !== pane || laterSiblingIsNotChrome(host)) pane.appendChild(host);
  } else {
    const anchor = paintAnchor(state, pane);
    if (anchor && anchor.nextSibling !== host) anchor.after(host);
  }
}

/** The topmost of the object's own nodes in the pane, which its badges paint just above. */
function paintAnchor(state: CellState, pane: Element) {
  return [state.control?.node, state.text?.node, state.shape?.node].find(
    (node) => node?.parentNode === pane
  );
}

/** A selected object's badges stay above everything but other badges in the overlay. */
function laterSiblingIsNotChrome(host: Element) {
  for (let next = host.nextElementSibling; next; next = next.nextElementSibling)
    if (!next.hasAttribute("data-canvas-chrome")) return true;
  return false;
}

function setAttribute(node: Element, name: string, value: string) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
