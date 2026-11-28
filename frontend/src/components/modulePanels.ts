import type { ComponentType } from "react";
import type { CanvasDocument } from "../document/canvasDocument";
import { MODULE_IDS, moduleEnabled, type ModuleId } from "../document/modules";
import type { Item } from "../document/types";
import type { EditorController } from "../editor/controller";
import { ArchitectureLibrary, ScreenLibrary, type LibraryProps } from "./StencilLibraries";
import { OutlinePanel } from "./OutlinePanel";
import { WoodLibrary } from "./WoodLibrary";
import { WoodCutList } from "./WoodLists";
import { WoodInspector } from "./Woodworking";
import type { useRailSections } from "./useRailSections";

interface ModulePanels {
  library: ComponentType<LibraryProps>;
  tools: ComponentType<{ editor: EditorController }>;
  inspector: ComponentType<{ editor: EditorController; selected: Item[] }>;
  navigation: ComponentType<{
    editor: EditorController;
    sections: ReturnType<typeof useRailSections>;
  }>;
}

const PANELS: Record<ModuleId, Partial<ModulePanels>> = {
  woodworking: { library: WoodLibrary, tools: WoodCutList, inspector: WoodInspector },
  architecture: { library: ArchitectureLibrary },
  ux: { library: ScreenLibrary },
  "mind-maps": { navigation: OutlinePanel },
};

export function modulePanels<K extends keyof ModulePanels>(document: CanvasDocument, slot: K) {
  return MODULE_IDS.flatMap((id) => {
    const Panel = PANELS[id][slot];
    return Panel && moduleEnabled(document, id) ? [{ id, Panel }] : [];
  });
}
