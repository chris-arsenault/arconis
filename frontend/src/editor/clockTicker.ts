import { clockText, isFinished } from "../document/clock";
import type { EditorController } from "./controller";

/** How often the clocks on screen are brought up to date. */
const TICK_MS = 250;

/**
 * Keeps every drawn clock's reading current. The document holds only when a clock started, so
 * each browser counts for itself here and nothing is written or sent as time passes.
 */
export function bindClocks(editor: EditorController) {
  const tick = () => {
    const now = Date.now();
    let finished = false;
    for (const face of editor.element.querySelectorAll<HTMLElement>("[data-clock]")) {
      const clock = editor.document.get(face.dataset.clock ?? "")?.clock;
      if (!clock) continue;
      const text = clockText(clock, now);
      if (face.textContent !== text) face.textContent = text;
      const done = isFinished(clock, now);
      if (done !== face.classList.contains("clock-done")) {
        face.classList.toggle("clock-done", done);
        finished = true;
      }
    }
    // Running out changes what the controls offer, though nothing in the document changed.
    if (finished) editor.emit();
  };
  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
}
