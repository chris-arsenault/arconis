import {
  Circle,
  Cloud,
  Database,
  Diamond,
  Hand,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  PanelTop,
  Server,
  Square,
  StickyNote,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Shape, Tool } from "../editor/controller";
import { findCommand } from "../editor/registry";
import { shortcutLabel } from "../editor/shortcuts";

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

/** A tool's label with the shortcut the command table gives it, as "Select (V)". */
function withShortcut(label: string, tool: Tool, extra = "") {
  const shortcut = findCommand(`tool.${tool}`).shortcuts?.[0];
  const keys = [shortcut ? shortcutLabel(shortcut) : "", extra].filter(Boolean).join(" / ");
  return keys ? `${label} (${keys})` : label;
}

function toolEntry(id: Tool, label: string, icon: LucideIcon, extra = ""): ToolEntry {
  return { id, label: withShortcut(label, id, extra), icon };
}

function stencil(shape: Shape, name: string, icon: LucideIcon, label = name): Stencil {
  return { shape, name, label: withShortcut(label, shape), icon };
}

export const TOOLS: ToolEntry[] = [
  toolEntry("select", "Select", MousePointer2),
  toolEntry("pan", "Pan", Hand, "Space"),
  toolEntry("connect", "Connector: click two objects", MoveUpRight),
  toolEntry("markup", "Markup", Highlighter),
];

export const STENCIL_GROUPS: { title: string; stencils: Stencil[] }[] = [
  {
    title: "Basics",
    stencils: [
      stencil("note", "Note", StickyNote, "Sticky note"),
      stencil("text", "Text", Type),
      stencil("rectangle", "Rectangle", Square),
      stencil("ellipse", "Ellipse", Circle),
      stencil("decision", "Decision", Diamond),
      stencil("frame", "Frame", PanelTop),
    ],
  },
  {
    title: "Architecture",
    stencils: [
      stencil("service", "Service", Server),
      stencil("database", "Database", Database),
      stencil("cloud", "Cloud", Cloud),
      stencil("person", "Person", UserRound),
    ],
  },
];
