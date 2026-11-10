import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CheckSquare,
  GitBranch,
  MessageSquare,
  Settings as SettingsIcon,
  Tags,
  Flag,
  X,
  type LucideIcon,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import {
  displayPreferences,
  type DisplayPreferences,
  type IndicatorType,
  type IndicatorVisibility,
} from "../editor/displayPreferences";
import { HelpZoneToggle } from "./HelpZone";
import "./settings.css";

const INDICATORS: { type: IndicatorType; label: string; icon: LucideIcon }[] = [
  { type: "comments", label: "Comments", icon: MessageSquare },
  { type: "tags", label: "Tags", icon: Tags },
  { type: "markers", label: "Markers", icon: Flag },
  { type: "relationships", label: "Relationships", icon: GitBranch },
  { type: "status", label: "Tasks and locks", icon: CheckSquare },
];
const VISIBILITY: { value: IndicatorVisibility; label: string; detail: string }[] = [
  { value: "show", label: "Show", detail: "Show these indicators on every object in your view." },
  {
    value: "selected",
    label: "Selected",
    detail: "Show these indicators only on objects you select.",
  },
  {
    value: "hide",
    label: "Hide",
    detail: "Hide these indicators; their details stay in Properties.",
  },
];
const CLOSE_DETAIL = "Close settings; your choices are already applied.";

export function Settings({ editor }: Readonly<{ editor: EditorController }>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        className="settings-button icon-action"
        data-help-id="settings"
        data-help-topic="editing"
        aria-label="Settings"
        aria-haspopup="dialog"
        data-hint="Settings"
        data-hint-detail="Choose which indicators, markup and grid appear in your view."
        onClick={() => setOpen(true)}
      >
        <SettingsIcon size={17} />
      </button>
      {open && <SettingsDialog editor={editor} onClose={close} />}
    </>
  );
}

function SettingsDialog({
  editor,
  onClose,
}: Readonly<{ editor: EditorController; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preferences = useSyncExternalStore(
    displayPreferences.subscribe,
    displayPreferences.snapshot
  );
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  useEffect(() => {
    const node = dialog.current!;
    const stop = (event: KeyboardEvent) => event.stopPropagation();
    node.addEventListener("keydown", stop);
    node.showModal();
    return () => node.removeEventListener("keydown", stop);
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
    >
      <header>
        <h2 id="settings-title">Settings</h2>
        <button
          className="icon-action"
          aria-label="Close settings"
          data-hint-detail={CLOSE_DETAIL}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="settings-content">
        <h3>Canvas display</h3>
        <p>Changes apply to your view on this device.</p>
        <div className="settings-toggles">
          <label data-hint-detail="Show or hide the markup drawn over the canvas, in your view only.">
            <input
              type="checkbox"
              checked={editor.drawing.visible}
              onChange={() => editor.drawing.toggle()}
            />
            Show markup
          </label>
          <label data-hint-detail="Show a grid in your view; while it shows, moved objects snap to it.">
            <input
              type="checkbox"
              checked={editor.grid.visible}
              onChange={() => {
                editor.grid.toggle();
                editor.emit();
              }}
            />
            Show grid and snap
          </label>
          <HelpZoneToggle />
        </div>
        <h3>Object indicators</h3>
        <p>
          Selected shows indicators only on selected objects. Hidden details stay in Properties.
        </p>
        <IndicatorSettings preferences={preferences} />
      </div>
      <footer>
        <button data-hint-detail={CLOSE_DETAIL} onClick={onClose}>
          Done
        </button>
      </footer>
    </dialog>
  );
}

function IndicatorSettings({ preferences }: Readonly<{ preferences: DisplayPreferences }>) {
  return INDICATORS.map(({ type, label, icon: Icon }) => (
    <div className="indicator-setting" key={type}>
      <span id={`indicator-${type}`}>
        <Icon size={16} /> {label}
      </span>
      <div className="indicator-options" role="radiogroup" aria-labelledby={`indicator-${type}`}>
        {VISIBILITY.map(({ value, label: option, detail }) => (
          <label key={value} data-hint-detail={detail}>
            <input
              type="radio"
              name={`indicator-${type}`}
              value={value}
              checked={preferences[type] === value}
              onChange={() => displayPreferences.set(type, value)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  ));
}
