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

const tools: { id: Tool; label: string; icon: LucideIcon }[] = [
  { id: "select", label: "Select (V)", icon: MousePointer2 },
  { id: "pan", label: "Pan (H / Space)", icon: Hand },
  { id: "sticky", label: "Sticky note (N)", icon: StickyNote },
  { id: "rectangle", label: "Rectangle (R)", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "diamond", label: "Decision (D)", icon: Diamond },
  { id: "service", label: "Service", icon: Server },
  { id: "database", label: "Database", icon: Database },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "person", label: "Person", icon: UserRound },
  { id: "connector", label: "Connector: click two objects", icon: MoveUpRight },
  { id: "text", label: "Text", icon: Type },
  { id: "stroke", label: "Draw (P)", icon: Pencil },
];
export function Toolbar({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <nav className="tool-rail" aria-label="Canvas tools">
      {tools.map((tool) => (
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
