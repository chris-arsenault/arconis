import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CircleHelp } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import { runCommand } from "../editor/registry";
import { showHelp } from "../editor/ui";
import { startOrientation } from "../help/orientation";
import { requestPractice, startPractice } from "../help/practice";
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

/**
 * The help reference when open, a first visit's offer of the orientation, and the hands-on
 * tutorial when this room was opened for practice.
 */
export function HelpSurfaces({
  editor,
  session,
}: Readonly<{ editor: EditorController; session: RoomSession }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const tutorials = useMemo(
    () => ({
      tour: () => tour(editor),
      practice: () => {
        showHelp(editor, null);
        requestPractice();
      },
    }),
    [editor]
  );
  useEffect(() => {
    let tutorial: Awaited<ReturnType<typeof startPractice>> = null;
    let active = true;
    void startPractice(session, editor).then((started) => {
      tutorial = started;
      if (!active) tutorial?.destroy();
    });
    return () => {
      active = false;
      tutorial?.destroy();
    };
  }, [session, editor]);
  return (
    <>
      {editor.ui.help !== null && <HelpReference editor={editor} tutorials={tutorials} />}
      <OrientationOffer onTour={() => tour(editor)} />
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
