import {
  MousePointer2,
  Hand,
  StickyNote,
  Square,
  Circle,
  Diamond,
  Database,
  Cloud,
  UserRound,
  Type,
  Pencil,
  MoveUpRight,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { EditorController, Tool } from "../editor/controller";

const tools: { id: Tool; label: string; icon: LucideIcon; mode: string }[] = [
  { id: "select", label: "Select (V)", icon: MousePointer2, mode: "both" },
  { id: "pan", label: "Pan (H / Space)", icon: Hand, mode: "both" },
  { id: "sticky", label: "Sticky note (N)", icon: StickyNote, mode: "both" },
  { id: "rectangle", label: "Rectangle (R)", icon: Square, mode: "diagram" },
  { id: "ellipse", label: "Ellipse", icon: Circle, mode: "diagram" },
  { id: "diamond", label: "Decision (D)", icon: Diamond, mode: "diagram" },
  { id: "service", label: "Service", icon: Server, mode: "diagram" },
  { id: "database", label: "Database", icon: Database, mode: "diagram" },
  { id: "cloud", label: "Cloud", icon: Cloud, mode: "diagram" },
  { id: "person", label: "Person", icon: UserRound, mode: "diagram" },
  { id: "connector", label: "Connector: click two objects", icon: MoveUpRight, mode: "both" },
  { id: "text", label: "Text", icon: Type, mode: "both" },
  { id: "stroke", label: "Draw (P)", icon: Pencil, mode: "both" },
];
export function Toolbar({ editor, mode }: Readonly<{ editor: EditorController; mode: string }>) {
  return (
    <nav className="tool-rail" aria-label="Canvas tools">
      {tools
        .filter((tool) => tool.mode === "both" || mode === "diagram")
        .map((tool) => (
          <button
            key={tool.id}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={editor.tool === tool.id}
            className={editor.tool === tool.id ? "tool active" : "tool"}
            onClick={() => editor.setTool(tool.id)}
          >
            <tool.icon size={20} />
          </button>
        ))}
    </nav>
  );
}
