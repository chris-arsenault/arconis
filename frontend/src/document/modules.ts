import type { CanvasDocument } from "./canvasDocument";

/** Built-in authoring modules. Missing settings give older canvases their original UI. */
export const CANVAS_MODULES = {
  woodworking: {
    name: "Woodworking",
    detail: "Stock, joinery, hardware, physical part properties and cut lists.",
    defaultEnabled: false,
    key: "woodworking",
  },
  architecture: {
    name: "Architecture",
    detail: "System diagram shapes, infrastructure icons and vendor libraries.",
    defaultEnabled: true,
    key: "module:architecture",
  },
  "mind-maps": {
    name: "Mind maps",
    detail: "Topic branches, tree layouts, outline editing and keyboard shortcuts.",
    defaultEnabled: true,
    key: "module:mind-maps",
  },
  ux: {
    name: "UX design",
    detail: "Phone, tablet, laptop and desktop screen frames.",
    defaultEnabled: true,
    key: "module:ux",
  },
} as const;

export type ModuleId = keyof typeof CANVAS_MODULES;
export const MODULE_IDS = Object.keys(CANVAS_MODULES) as ModuleId[];

export function moduleEnabled(document: CanvasDocument, id: ModuleId) {
  const module = CANVAS_MODULES[id];
  const value = document.meta.get(module.key);
  return value === undefined ? module.defaultEnabled : value === "on";
}

export function setModuleEnabled(document: CanvasDocument, id: ModuleId, enabled: boolean) {
  const module = CANVAS_MODULES[id];
  if (enabled === module.defaultEnabled) document.meta.delete(module.key);
  else document.meta.set(module.key, enabled ? "on" : "off");
}
