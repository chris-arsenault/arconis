import {
  Circle,
  Cloud,
  Database,
  Diamond,
  Hand,
  MousePointer2,
  MoveUpRight,
  PanelTop,
  Pencil,
  Presentation,
  Server,
  Square,
  StickyNote,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Shape, Tool } from "../editor/controller";

export interface ToolEntry {
  id: Tool;
  label: string;
  icon: LucideIcon;
}
export interface Stencil {
  shape: Shape;
  label: string;
  name: string;
  icon: LucideIcon;
}

/** Lucide icons shown without searching, by the set's own names. */
export const INFRASTRUCTURE_ICONS = [
  "Server",
  "HardDrive",
  "Database",
  "Cloud",
  "Network",
  "Router",
  "Container",
  "Cpu",
  "Globe",
  "Shield",
  "Lock",
  "Key",
  "Users",
  "Laptop",
  "Smartphone",
  "Monitor",
  "Mail",
  "MessageSquare",
  "File",
  "Folder",
  "Layers",
  "GitBranch",
  "Activity",
  "Bell",
].map((name) => `lucide:${name}`);

export const TOOLS: ToolEntry[] = [
  { id: "select", label: "Select (V)", icon: MousePointer2 },
  { id: "pan", label: "Pan (H / Space)", icon: Hand },
  { id: "connect", label: "Connector: click two objects", icon: MoveUpRight },
  { id: "draw", label: "Draw (P)", icon: Pencil },
];

export const STENCIL_GROUPS: { title: string; stencils: Stencil[] }[] = [
  {
    title: "Basics",
    stencils: [
      { shape: "note", name: "Note", label: "Sticky note (N)", icon: StickyNote },
      { shape: "text", name: "Text", label: "Text", icon: Type },
      { shape: "rectangle", name: "Rectangle", label: "Rectangle (R)", icon: Square },
      { shape: "ellipse", name: "Ellipse", label: "Ellipse", icon: Circle },
      { shape: "decision", name: "Decision", label: "Decision (D)", icon: Diamond },
      { shape: "frame", name: "Frame", label: "Frame", icon: PanelTop },
      { shape: "slide", name: "Slide", label: "Slide", icon: Presentation },
    ],
  },
  {
    title: "Architecture",
    stencils: [
      { shape: "service", name: "Service", label: "Service", icon: Server },
      { shape: "database", name: "Database", label: "Database", icon: Database },
      { shape: "cloud", name: "Cloud", label: "Cloud", icon: Cloud },
      { shape: "person", name: "Person", label: "Person", icon: UserRound },
    ],
  },
];
