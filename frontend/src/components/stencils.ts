import {
  Circle,
  Cloud,
  Database,
  Diamond,
  Hand,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Server,
  Square,
  StickyNote,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "../editor/controller";
import type { ObjectKind } from "../document/types";

export interface ToolEntry {
  id: Tool;
  label: string;
  icon: LucideIcon;
}
export interface Stencil {
  kind: ObjectKind;
  label: string;
  name: string;
  icon: LucideIcon;
}

export const TOOLS: ToolEntry[] = [
  { id: "select", label: "Select (V)", icon: MousePointer2 },
  { id: "pan", label: "Pan (H / Space)", icon: Hand },
  { id: "connector", label: "Connector: click two objects", icon: MoveUpRight },
  { id: "stroke", label: "Draw (P)", icon: Pencil },
];

export const STENCIL_GROUPS: { title: string; stencils: Stencil[] }[] = [
  {
    title: "Basics",
    stencils: [
      { kind: "sticky", name: "Note", label: "Sticky note (N)", icon: StickyNote },
      { kind: "text", name: "Text", label: "Text", icon: Type },
      { kind: "rectangle", name: "Rectangle", label: "Rectangle (R)", icon: Square },
      { kind: "ellipse", name: "Ellipse", label: "Ellipse", icon: Circle },
      { kind: "diamond", name: "Decision", label: "Decision (D)", icon: Diamond },
    ],
  },
  {
    title: "Architecture",
    stencils: [
      { kind: "service", name: "Service", label: "Service", icon: Server },
      { kind: "database", name: "Database", label: "Database", icon: Database },
      { kind: "cloud", name: "Cloud", label: "Cloud", icon: Cloud },
      { kind: "person", name: "Person", label: "Person", icon: UserRound },
    ],
  },
];
