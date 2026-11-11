import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Settings as SettingsIcon, Tags, X } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { displayPreferences, type IndicatorVisibility } from "../editor/displayPreferences";
import { HelpZoneToggle } from "./HelpZone";
import { ScaleSettings } from "./ScaleControls";
import "./settings.css";

const VISIBILITY: { value: IndicatorVisibility; label: string; detail: string }[] = [
  { value: "show", label: "Show", detail: "Show indicators on every object in your view." },
  {
    value: "selected",
    label: "Selected",
    detail: "Show indicators only on objects you select.",
  },
  {
    value: "hide",
    label: "Hide",
    detail: "Hide indicators; their details stay in Properties.",
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
        data-hint-detail="Choose what appears in your view, and set the canvas's scale, units and grid spacing."
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
        <DisplaySettings editor={editor} />
        <ScaleSettings editor={editor} />
        <h3>Object indicators</h3>
        <p>
          Comments, tags, markers, relationships, tasks and locks show together. Selected shows them
          only on selected objects; hidden details stay in Properties.
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

/** What shows in this person's view of the canvas. */
function DisplaySettings({ editor }: Readonly<{ editor: EditorController }>) {
  return (
    <>
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
    </>
  );
}

function IndicatorSettings({ preferences }: Readonly<{ preferences: IndicatorVisibility }>) {
  return (
    <div className="indicator-setting">
      <span id="indicator-visibility">
        <Tags size={16} /> Indicators
      </span>
      <div className="indicator-options" role="radiogroup" aria-labelledby="indicator-visibility">
        {VISIBILITY.map(({ value, label: option, detail }) => (
          <label key={value} data-hint-detail={detail}>
            <input
              type="radio"
              name="indicator-visibility"
              value={value}
              checked={preferences === value}
              onChange={() => displayPreferences.set(value)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
