import type { EditorController } from "./controller";
import { CURSORS, TOOL_CURSORS, type CursorName } from "./cursors";

/** One policy covers editor modes, temporary pan and graph descendants which set their own cursor. */
export function bindInteractionCursors(editor: EditorController, signal: AbortSignal) {
  let panning = false;
  const policies: { when: () => boolean; cursor: () => CursorName }[] = [
    { when: () => panning, cursor: () => "grabbing" },
    { when: () => editor.presenter.active, cursor: () => "default" },
    { when: () => editor.ui.relating !== null, cursor: () => "target" },
    { when: () => editor.drawing.active, cursor: () => editor.drawing.cursor },
  ];
  const update = () => {
    const policy = policies.find(({ when }) => when());
    const name = policy ? policy.cursor() : TOOL_CURSORS[editor.tool as keyof typeof TOOL_CURSORS];
    editor.element.style.setProperty("--interaction-cursor", CURSORS[name].css);
    editor.element.dataset.cursor = name;
    editor.element.dataset.cursorOverride = String(
      panning || editor.tool !== "select" || editor.ui.relating !== null
    );
  };
  const release = () => {
    panning = false;
    update();
  };
  const unsubscribe = editor.subscribe(update);
  editor.element.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 1 || (event.button === 0 && editor.tool === "pan")) {
        panning = true;
        update();
      }
    },
    { signal, capture: true }
  );
  window.addEventListener("pointerup", release, { signal, capture: true });
  window.addEventListener("pointercancel", release, { signal, capture: true });
  window.addEventListener("blur", release, { signal });
  editor.element.addEventListener("lostpointercapture", release, { signal });
  signal.addEventListener(
    "abort",
    () => {
      unsubscribe();
      editor.element.style.removeProperty("--interaction-cursor");
    },
    { once: true }
  );
  update();
}
