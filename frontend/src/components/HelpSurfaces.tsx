import { useSyncExternalStore } from "react";
import { CircleHelp } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { runCommand } from "../editor/registry";
import { showHelp } from "../editor/ui";
import { startOrientation } from "../help/orientation";
import { HelpReference } from "./HelpReference";
import { OrientationOffer } from "./OrientationOffer";

/**
 * The orientation runs over a clear workspace, so Help closes first. The tour starts a frame
 * later, once the closing dialog has handed focus back, so its first step keeps focus.
 */
function tour(editor: EditorController) {
  showHelp(editor, null);
  requestAnimationFrame(() => startOrientation(editor));
}

/** The help reference when open and a first visit's offer of the orientation. */
export function HelpSurfaces({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const onTour = () => tour(editor);
  return (
    <>
      {editor.ui.help !== null && <HelpReference editor={editor} onTour={onTour} />}
      <OrientationOffer onTour={onTour} />
    </>
  );
}

/** Opens the guides, every command and the tour; `?` does the same from the keyboard. */
export function HelpButton({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  return (
    <button
      className="settings-button icon-action"
      aria-label="Help"
      aria-expanded={editor.ui.help !== null}
      data-help-id="help"
      data-hint="Help (?)"
      data-hint-detail="Open the guides, every command and the workspace tour."
      onClick={() => runCommand(editor, "view.help")}
    >
      <CircleHelp size={17} />
    </button>
  );
}
