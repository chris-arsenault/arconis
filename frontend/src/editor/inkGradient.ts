import type { Appearance } from "../document/appearance";

/** Renderer-owned SVG definitions support arbitrary gradient directions on editable ink. */
export function drawInkGradient(
  node: Element | null | undefined,
  appearance: Appearance,
  id: string,
  defs: SVGDefsElement
) {
  if (!node || !appearance.gradient || appearance.gradient === "none" || !appearance.closed) return;
  const ns = defs.namespaceURI;
  const gradient = document.createElementNS(ns, "linearGradient");
  gradient.setAttribute("id", id);
  const angle = ((appearance.gradientAngle ?? 0) * Math.PI) / 180;
  gradient.setAttribute("x1", String(0.5 - Math.cos(angle) / 2));
  gradient.setAttribute("y1", String(0.5 - Math.sin(angle) / 2));
  gradient.setAttribute("x2", String(0.5 + Math.cos(angle) / 2));
  gradient.setAttribute("y2", String(0.5 + Math.sin(angle) / 2));
  for (const [offset, color] of [
    ["0%", appearance.fill],
    ["100%", appearance.gradient],
  ]) {
    const stop = document.createElementNS(ns, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-color", color);
    gradient.append(stop);
  }
  defs.append(gradient);
  node.querySelectorAll("path").forEach((path) => {
    const fill = path.getAttribute("fill");
    if (fill && fill !== "none" && fill !== "transparent") path.setAttribute("fill", `url(#${id})`);
  });
}
