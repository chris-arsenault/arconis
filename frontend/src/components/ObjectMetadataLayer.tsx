import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Rectangle } from "@maxgraph/core";
import type { EditorController } from "../editor/controller";

/** Interleave chrome with the object's SVG paint order; selection raises it above the canvas. */
export function ObjectMetadataLayer({
  editor,
  id,
  selected,
  dimmed,
  label,
  bounds,
  children,
}: Readonly<{
  editor: EditorController;
  id: string;
  selected: boolean;
  dimmed: boolean;
  label: string;
  bounds: Rectangle;
  children: ReactNode;
}>) {
  const [host] = useState(() =>
    document.createElementNS("http://www.w3.org/2000/svg", "foreignObject")
  );
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    host.setAttribute("data-canvas-chrome", id);
    host.setAttribute("width", String(editor.element.clientWidth));
    host.setAttribute("height", String(editor.element.clientHeight));
    host.setAttribute("pointer-events", "none");
    insertMetadata(editor, id, host, selected);
    if (ref.current) positionMetadata(editor, ref.current, bounds);
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
  if (selected) pane.appendChild(host);
  else {
    const anchor = [state.control?.node, state.text?.node, state.shape?.node].find(
      (node) => node?.parentNode === pane
    );
    anchor?.after(host);
  }
}

function positionMetadata(editor: EditorController, node: HTMLDivElement, bounds: Rectangle) {
  const width = editor.element.clientWidth;
  const height = editor.element.clientHeight;
  node.style.maxWidth = `${Math.min(width - 16, Math.max(96, Math.min(220, bounds.width)))}px`;
  const box = node.getBoundingClientRect();
  const below = bounds.y + bounds.height + 2;
  const top = below + box.height <= height - 8 ? below : bounds.y - box.height - 2;
  const left = bounds.x + (bounds.width - box.width) / 2;
  node.style.left = `${Math.max(8, Math.min(left, width - box.width - 8))}px`;
  node.style.top = `${Math.max(8, Math.min(top, height - box.height - 8))}px`;
}
