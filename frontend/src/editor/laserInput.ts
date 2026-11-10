import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "./controller";
import { extendLaser, sendLaser, type PeerState } from "./presence";
import { isInputTarget } from "./ui";

/** The key held to point with the laser. */
export const LASER_KEY = "k";

/**
 * Holding K turns the pointer into a laser: a trail that peers see fade behind it, written to
 * nothing. Releasing K ends it and the trail fades away for everyone.
 */
export function bindLaser(editor: EditorController, session: RoomSession) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let points: PeerState["laser"] = [];
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  const publish = () => {
    sendLaser(session, points?.length ? points : null);
    editor.ui.laser = points ?? [];
    editor.emit();
  };
  const fade = () => {
    fadeTimer = null;
    points = extendLaser(points, points?.at(-1) ?? { x: 0, y: 0 }).slice(0, -1);
    publish();
    if (points?.length) fadeTimer = setTimeout(fade, 100);
  };
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key.toLowerCase() !== LASER_KEY || event.repeat || isInputTarget(event.target))
        return;
      if (event.ctrlKey || event.metaKey || event.altKey || editor.presenter.active) return;
      event.preventDefault();
      editor.ui.lasering = true;
      editor.emit();
    },
    options
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.key.toLowerCase() !== LASER_KEY || !editor.ui.lasering) return;
      editor.ui.lasering = false;
      fadeTimer ??= setTimeout(fade, 100);
      editor.emit();
    },
    options
  );
  editor.element.addEventListener(
    "pointermove",
    (event) => {
      if (!editor.ui.lasering) return;
      points = extendLaser(points, editor.worldPoint(event));
      publish();
    },
    options
  );
  return () => {
    abort.abort();
    if (fadeTimer) clearTimeout(fadeTimer);
    sendLaser(session, null);
  };
}
