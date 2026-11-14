import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  type LucideIcon,
} from "lucide-react";
import type { Align, Look, VerticalAlign } from "../document/types";

const ACROSS: { value: Align; label: string; icon: LucideIcon }[] = [
  { value: "left", label: "Align text left", icon: AlignLeft },
  { value: "center", label: "Center text", icon: AlignCenter },
  { value: "right", label: "Align text right", icon: AlignRight },
];
const DOWN: { value: VerticalAlign; label: string; icon: LucideIcon }[] = [
  { value: "top", label: "Align text to top", icon: AlignVerticalJustifyStart },
  { value: "middle", label: "Center text vertically", icon: AlignVerticalJustifyCenter },
  { value: "bottom", label: "Align text to bottom", icon: AlignVerticalJustifyEnd },
];

/**
 * Where text sits within its object, as draw.io's text alignment buttons set it: left, center or
 * right across, and top, middle or bottom down. A mixed selection presses neither button.
 */
export function TextAlignment({
  align,
  valign,
  change,
}: Readonly<{ align: unknown; valign: unknown; change: (look: Look) => void }>) {
  return (
    <div className="text-alignment">
      <div className="segmented" role="group" aria-label="Horizontal text alignment">
        {ACROSS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={align === value}
            data-hint-detail="Place the text across its object."
            onClick={() => change({ align: value })}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Vertical text alignment">
        {DOWN.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={valign === value}
            data-hint-detail="Place the text from the top to the bottom of its object."
            onClick={() => change({ valign: value })}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
