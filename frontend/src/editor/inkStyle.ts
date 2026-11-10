import type { CanvasDocument } from "../document/canvasDocument";
import { effectiveAppearance } from "../document/appearance";
import type { Item, Look } from "../document/types";
import { inkAction, type InkSettings } from "./inkCommands";

/** Palette edits target selected paths explicitly; they never mutate the next brush's defaults. */
export function changeInkStyle(
  document: CanvasDocument,
  selected: Item[],
  values: Partial<InkSettings>
) {
  const look: Look = {};
  if (values.color !== undefined) look.line = values.color;
  if (values.width !== undefined) look.lineWidth = values.width;
  if (values.opacity !== undefined)
    Object.assign(look, { opacity: values.opacity, strokeOpacity: values.opacity });
  for (const key of ["fill", "gradient", "gradientAngle"] as const)
    if (values[key] !== undefined) Object.assign(look, { [key]: values[key] });
  inkAction(document, () =>
    selected
      .filter((item) => (item.type === "drawing" || item.type === "highlight") && !item.locked)
      .forEach((item) => document.patchLook(item.id, look))
  );
}

export function selectedInkSettings(document: CanvasDocument, item: Item): InkSettings {
  const look = effectiveAppearance(item, document.namedStyle(item.style));
  return {
    mode: item.type === "highlight" ? "highlight" : "lasso",
    shape: item.ink,
    color: look.line,
    width: look.lineWidth,
    fill: look.fill,
    gradient: look.gradient ?? "none",
    gradientAngle: look.gradientAngle ?? 0,
    opacity: look.strokeOpacity ?? 100,
  };
}
