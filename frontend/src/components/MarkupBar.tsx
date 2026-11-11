import { useState, type ReactNode } from "react";
import {
  Braces,
  Brackets,
  Check,
  Cloud,
  Eraser,
  Eye,
  EyeOff,
  Highlighter,
  Lasso,
  MoveUpRight,
  Pencil,
  ScanLine,
  Square,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { isMarkup } from "../document/ink";
import {
  MARKUP_COLORS,
  MARKUP_SIZES,
  MARKUP_TOOLS,
  type MarkupSize,
  type MarkupTool,
} from "../editor/markupPreferences";
import { useNarrowLayout } from "./useNarrowLayout";
import "./markup.css";

const TOOL_ICONS: Record<MarkupTool, LucideIcon> = {
  pen: Pencil,
  marker: Highlighter,
  arrow: MoveUpRight,
  box: Square,
  bracket: Brackets,
  brace: Braces,
  cloud: Cloud,
  outline: ScanLine,
  eraser: Eraser,
  select: Lasso,
};
const DOT: Record<MarkupSize, number> = { small: 3, medium: 5, large: 8 };
type Props = Readonly<{ editor: EditorController }>;

/**
 * Markup's whole surface: a bar over the canvas while Markup is armed. It leaves the side panels
 * as they were, so annotating a diagram never replaces the stencils or shows drawing controls.
 */
export function MarkupBar({ editor }: Props) {
  const narrow = useNarrowLayout();
  if (editor.tool !== "markup") return null;
  const { tool, color, size } = editor.drawing.markupChoice;
  return (
    <div
      className="markup-bar"
      role="toolbar"
      aria-label="Markup"
      data-help-id="markup-bar"
      data-help-topic="drawing#markup"
    >
      <MarkupTools editor={editor} />
      <Fold
        narrow={narrow}
        label="Markup colour"
        detail="Choose the colour of the next annotation."
        current={<Swatch color={color} />}
      >
        <MarkupColours editor={editor} />
      </Fold>
      <Fold
        narrow={narrow}
        label="Markup size"
        detail="Choose how thick the next annotation is."
        current={<Dot size={size} />}
      >
        <MarkupSizes editor={editor} disabled={tool === "select"} />
      </Fold>
      <MarkupHousekeeping editor={editor} />
    </div>
  );
}

function MarkupTools({ editor }: Props) {
  const { tool } = editor.drawing.markupChoice;
  return (
    <div className="markup-group" role="group" aria-label="Markup tools">
      {(Object.keys(MARKUP_TOOLS) as MarkupTool[]).map((id) => {
        const Icon = TOOL_ICONS[id];
        return (
          <button
            key={id}
            aria-label={MARKUP_TOOLS[id].label}
            aria-pressed={tool === id}
            data-hint={MARKUP_TOOLS[id].label}
            data-hint-detail={MARKUP_TOOLS[id].hint}
            onClick={() => editor.drawing.chooseMarkup({ tool: id })}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}

function MarkupColours({ editor }: Props) {
  const { tool, color } = editor.drawing.markupChoice;
  const paints = tool !== "eraser" && tool !== "select";
  return (
    <div className="markup-group" role="group" aria-label="Markup colour">
      {MARKUP_COLORS.map((entry) => (
        <button
          key={entry.color}
          className="markup-swatch"
          aria-label={entry.name}
          aria-pressed={color === entry.color}
          disabled={!paints}
          data-hint={`${entry.name} markup`}
          data-hint-detail="Use this colour for the next annotation."
          onClick={() => editor.drawing.chooseMarkup({ color: entry.color })}
        >
          <Swatch color={entry.color} />
        </button>
      ))}
    </div>
  );
}

function MarkupSizes({ editor, disabled }: Props & Readonly<{ disabled: boolean }>) {
  const { size } = editor.drawing.markupChoice;
  return (
    <div className="markup-group" role="group" aria-label="Markup size">
      {MARKUP_SIZES.map(({ id, label }) => (
        <button
          key={id}
          aria-label={label}
          aria-pressed={size === id}
          disabled={disabled}
          data-hint={`${label} markup`}
          data-hint-detail="Use this thickness for the next annotation, or this width for the eraser."
          onClick={() => editor.drawing.chooseMarkup({ size: id })}
        >
          <Dot size={id} />
        </button>
      ))}
    </div>
  );
}

/** What happens to the annotations as a whole: seeing them, clearing them, putting Markup away. */
function MarkupHousekeeping({ editor }: Props) {
  const { drawing } = editor;
  const count = editor.document.list().filter(isMarkup).length;
  return (
    <div className="markup-group">
      <button
        aria-label="Show annotations"
        aria-pressed={drawing.visible}
        data-hint="Show annotations"
        data-hint-detail="Show or hide markup in your view only; others keep their own setting."
        onClick={() => drawing.toggle()}
      >
        {drawing.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        <span className="rail-count" data-testid="annotation-count">
          {count}
        </span>
      </button>
      <button
        className="markup-clear"
        aria-label="Delete all annotations"
        disabled={!count}
        data-hint="Delete all annotations"
        data-hint-detail="Remove every annotation for everyone; the canvas content stays, and Undo restores them."
        onClick={() => drawing.clear()}
      >
        <Trash2 size={15} /> Clear
      </button>
      <button
        className="markup-done"
        aria-label="Finish markup"
        data-hint="Finish markup (V)"
        data-hint-detail="Put Markup away and return to selecting; your annotations stay on the canvas."
        onClick={() => editor.setTool("select")}
      >
        <Check size={15} /> Done
      </button>
    </div>
  );
}

function Swatch({ color }: Readonly<{ color: string }>) {
  return (
    <svg width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={color} />
    </svg>
  );
}

function Dot({ size }: Readonly<{ size: MarkupSize }>) {
  return (
    <svg width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r={DOT[size]} fill="currentColor" />
    </svg>
  );
}

/** On a narrow screen a group of choices folds behind a button showing the current one. */
function Fold({
  narrow,
  label,
  detail,
  current,
  children,
}: Readonly<{
  narrow: boolean;
  label: string;
  detail: string;
  current: ReactNode;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  if (!narrow) return <>{children}</>;
  return (
    <div className="markup-fold">
      <button
        aria-label={label}
        aria-expanded={open}
        data-hint={label}
        data-hint-detail={detail}
        onClick={() => setOpen(!open)}
      >
        {current}
      </button>
      {open && <div className="markup-popover">{children}</div>}
    </div>
  );
}
